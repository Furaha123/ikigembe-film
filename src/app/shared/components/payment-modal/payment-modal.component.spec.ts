import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { PaymentModalComponent } from './payment-modal.component';
import { Router, provideRouter } from '@angular/router';
import { PaymentConfig, PaymentService, PaymentStatusResponse } from '../../../core/services/payment.service';

const MOMO: PaymentConfig = { gateway: 'pawapay', needs_phone: true, redirect: false, demo: false };
const DPO: PaymentConfig = { gateway: 'dpo', needs_phone: false, redirect: true, demo: false };
import { ServicePurchase, ServicePurchaseAccepted } from '../../models/marketplace.interface';

const accepted: ServicePurchaseAccepted = {
  deposit_id: 'dep-9', status: 'Pending', message: 'Approve on your phone', amount: 5000, currency: 'RWF',
};
const settled = (s: PaymentStatusResponse['status']): PaymentStatusResponse => ({
  deposit_id: 'dep-9', status: s, amount: 5000, currency: 'RWF', purpose: 'actor_search',
  movie_id: null, movie_title: null, created_at: '',
});

describe('PaymentModalComponent (service purchase mode)', () => {
  let fixture: ComponentFixture<PaymentModalComponent>;
  let component: PaymentModalComponent;
  let payments: jasmine.SpyObj<PaymentService>;
  let initiate: jasmine.Spy;
  let poll$: Subject<PaymentStatusResponse>;

  const enterPhone = (value: string) => {
    const input = fixture.nativeElement.querySelector('#pm-phone') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const pay = () => (fixture.nativeElement.querySelector('.pm-pay-btn') as HTMLButtonElement).click();
  const alertText = () => (fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null)?.textContent?.trim();

  beforeEach(() => {
    poll$ = new Subject<PaymentStatusResponse>();
    payments = jasmine.createSpyObj<PaymentService>('PaymentService', ['initiate', 'pollUntilSettled', 'savePurchase', 'getConfig', 'forgetReturn']);
    payments.pollUntilSettled.and.returnValue(poll$);
    payments.getConfig.and.returnValue(of(MOMO));
    initiate = jasmine.createSpy('initiate').and.returnValue(of(accepted));

    TestBed.configureTestingModule({
      imports: [PaymentModalComponent],
      providers: [provideTranslateService(), provideRouter([]), { provide: PaymentService, useValue: payments }],
    });
    fixture = TestBed.createComponent(PaymentModalComponent);
    component = fixture.componentInstance;
    const service: ServicePurchase = { titleKey: 'marketplace.directory.purchaseTitle', initiate };
    fixture.componentRef.setInput('service', service);
    fixture.detectChanges();
  });

  it('renders the service title instead of a movie', () => {
    expect(fixture.nativeElement.querySelector('.pm-title').textContent).toContain('marketplace.directory.purchaseTitle');
    expect(fixture.nativeElement.querySelector('.pm-poster')).toBeNull();
  });

  it('starts the service deposit with the normalised phone and reuses the shared polling', fakeAsync(() => {
    const paid = jasmine.createSpy('paid');
    component.paid.subscribe(paid);

    enterPhone('+250 788 123 456');
    pay();
    fixture.detectChanges();

    expect(initiate).toHaveBeenCalledOnceWith('0788123456');
    expect(payments.initiate).not.toHaveBeenCalled();
    expect(payments.pollUntilSettled).toHaveBeenCalledOnceWith('dep-9');
    expect(fixture.nativeElement.querySelector('.pm-price').textContent).toContain('5,000');

    poll$.next(settled('Completed'));
    fixture.detectChanges();
    expect(component.success()).toBeTrue();
    expect(payments.savePurchase).not.toHaveBeenCalled(); // movie-only local hint
    tick(1800);
    expect(paid).toHaveBeenCalled();
  }));

  it('503 → "This service isn\'t available yet" (pricing not configured)', () => {
    initiate.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 503, error: { error: 'This service is not available yet: pricing has not been configured.' },
    })));
    enterPhone('0788123456');
    pay();
    fixture.detectChanges();
    expect(alertText()).toBe('marketplace.purchase.unavailable');
    expect(payments.pollUntilSettled).not.toHaveBeenCalled();
  });

  it('409 → shows the backend message (payment already pending)', () => {
    initiate.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { error: 'A payment for this service is already in progress.' },
    })));
    enterPhone('0788123456');
    pay();
    fixture.detectChanges();
    expect(alertText()).toBe('A payment for this service is already in progress.');
  });

  it('shows the declined state when the payment fails', () => {
    enterPhone('0788123456');
    pay();
    poll$.next(settled('Failed'));
    fixture.detectChanges();
    expect(alertText()).toBe('paymentModal.errors.declined');
    expect(component.success()).toBeFalse();
  });

  it('rejects an invalid phone without calling the backend', () => {
    enterPhone('12345');
    pay();
    fixture.detectChanges();
    expect(initiate).not.toHaveBeenCalled();
    expect(alertText()).toBe('paymentModal.errors.invalidPhone');
  });
});

describe('PaymentModalComponent (movie purchase: pending, recovery, dialog)', () => {
  let fixture: ComponentFixture<PaymentModalComponent>;
  let component: PaymentModalComponent;
  let payments: jasmine.SpyObj<PaymentService>;
  let poll$: Subject<PaymentStatusResponse>;
  const MOVIE = { id: 12, title: 'Umurage', price: 1000, thumbnail_url: null, duration_minutes: 20 };
  const movieStatus = (s: PaymentStatusResponse['status']): PaymentStatusResponse => ({
    deposit_id: 'dep-m', status: s, amount: 1000, currency: 'RWF', purpose: 'movie', movie_id: 12, movie_title: 'Umurage', created_at: '',
  });

  let config: PaymentConfig = MOMO;
  beforeEach(() => (config = MOMO));

  const create = (remembered: string | null = null) => {
    poll$ = new Subject<PaymentStatusResponse>();
    payments = jasmine.createSpyObj<PaymentService>('PaymentService',
      ['initiate', 'pollUntilSettled', 'savePurchase', 'rememberPending', 'pendingDeposit', 'forgetPending', 'getConfig',
       'checkStatus', 'cancel', 'rememberReturn', 'forgetReturn', 'paymentPageTarget']);
    payments.pollUntilSettled.and.returnValue(poll$);
    payments.getConfig.and.returnValue(of(config));
    payments.pendingDeposit.and.returnValue(remembered);
    payments.initiate.and.returnValue(of({ deposit_id: 'dep-m', status: 'Pending', message: '', amount: 1000, currency: 'RWF' }));
    TestBed.configureTestingModule({
      imports: [PaymentModalComponent],
      providers: [provideTranslateService(), provideRouter([]), { provide: PaymentService, useValue: payments }],
    });
    fixture = TestBed.createComponent(PaymentModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('movie', MOVIE);
    fixture.detectChanges();
  };
  const startPayment = () => {
    const input = fixture.nativeElement.querySelector('#pm-phone') as HTMLInputElement;
    input.value = '0788123456';
    input.dispatchEvent(new Event('input'));
    (fixture.nativeElement.querySelector('.pm-pay-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('remembers the deposit while pending and forgets it once Completed', () => {
    create();
    startPayment();
    expect(payments.initiate).toHaveBeenCalledOnceWith({ movie_id: 12, phone_number: '0788123456' });
    expect(payments.rememberPending).toHaveBeenCalledOnceWith('movie:12', 'dep-m');
    poll$.next(movieStatus('Completed'));
    expect(payments.forgetPending).toHaveBeenCalledWith('movie:12');
    expect(component.success()).toBeTrue();
  });

  it('shows "still waiting" (not an error) when polling ends unsettled, and re-checks the same deposit', () => {
    create();
    startPayment();
    poll$.complete(); // schedule exhausted while Pending
    fixture.detectChanges();
    expect(component.stillPending()).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(payments.forgetPending).not.toHaveBeenCalled(); // may still settle later

    poll$ = new Subject<PaymentStatusResponse>();
    payments.pollUntilSettled.and.returnValue(poll$);
    (fixture.nativeElement.querySelector('.pm-pay-btn') as HTMLButtonElement).click(); // "Check again"
    expect(payments.pollUntilSettled).toHaveBeenCalledTimes(2);
    expect(payments.pollUntilSettled.calls.mostRecent().args).toEqual(['dep-m']);
    expect(payments.initiate).toHaveBeenCalledTimes(1); // never charged twice
  });

  it('resumes a remembered deposit on open instead of starting a new payment', () => {
    create('dep-old');
    expect(payments.pollUntilSettled).toHaveBeenCalledOnceWith('dep-old');
    expect(payments.initiate).not.toHaveBeenCalled();
    expect(component.loading()).toBeTrue();
  });

  it('a declined payment is forgotten so the viewer can try again', () => {
    create();
    startPayment();
    poll$.next(movieStatus('Failed'));
    fixture.detectChanges();
    expect(payments.forgetPending).toHaveBeenCalledWith('movie:12');
    expect(component.loading()).toBeFalse();
  });

  it('cannot start a second deposit while one is in flight', () => {
    create();
    startPayment();
    component.pay();
    expect(payments.initiate).toHaveBeenCalledTimes(1);
  });

  it('labels a demo-mode payment so it is never mistaken for a real charge', () => {
    create();
    payments.initiate.and.returnValue(of({ deposit_id: 'dep-m', status: 'Pending', message: '', amount: 1000, currency: 'RWF', demo: true }));
    startPayment();
    expect(fixture.nativeElement.querySelector('.pm-demo').textContent).toContain('paymentModal.demo.label');
    expect(component.loadingMessage()).toBe('paymentModal.demo.simulating');
  });

  it('shows no demo label for a real payment', () => {
    create();
    startPayment();
    expect(fixture.nativeElement.querySelector('.pm-demo')).toBeNull();
  });

  it('is a labelled modal dialog and closes on Escape', () => {
    create();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('pm-title');
    expect(fixture.nativeElement.querySelector('#pm-title').textContent).toContain('Umurage');
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalled();
  });
});


describe('PaymentModalComponent (hosted page: DPO)', () => {
  let fixture: ComponentFixture<PaymentModalComponent>;
  let component: PaymentModalComponent;
  let payments: jasmine.SpyObj<PaymentService>;
  const MOVIE = { id: 12, title: 'Umurage', price: 1000, thumbnail_url: null, duration_minutes: 20 };
  const DEP = '11111111-2222-3333-4444-555555555555';
  const DPO_URL = 'https://secure.3gdirectpay.com/payv2.php?ID=TOK';

  const create = (remembered: string | null = null) => {
    payments = jasmine.createSpyObj<PaymentService>('PaymentService',
      ['initiate', 'pollUntilSettled', 'savePurchase', 'rememberPending', 'pendingDeposit', 'forgetPending', 'getConfig',
       'checkStatus', 'cancel', 'rememberReturn', 'forgetReturn', 'paymentPageTarget']);
    payments.getConfig.and.returnValue(of(DPO));
    payments.pendingDeposit.and.returnValue(remembered);
    payments.paymentPageTarget.and.callFake((url: string | null | undefined) => url === DPO_URL ? { external: url } : null);
    payments.checkStatus.and.returnValue(of({ deposit_id: DEP, status: 'Pending', amount: 1000, currency: 'RWF', purpose: 'movie',
      movie_id: 12, movie_title: 'Umurage', created_at: '', payment_url: DPO_URL } as PaymentStatusResponse));
    TestBed.configureTestingModule({
      imports: [PaymentModalComponent],
      providers: [provideTranslateService(), provideRouter([]), { provide: PaymentService, useValue: payments }],
    });
    fixture = TestBed.createComponent(PaymentModalComponent);
    component = fixture.componentInstance;
    spyOn(component, 'openExternal');
    fixture.componentRef.setInput('movie', MOVIE);
    fixture.detectChanges();
  };
  const payBtn = () => fixture.nativeElement.querySelector('.pm-pay-btn') as HTMLButtonElement;

  it('asks for no phone number and shows the hosted-page wording', () => {
    create();
    expect(fixture.nativeElement.querySelector('#pm-phone')).toBeNull();
    expect(payBtn().textContent).toContain('paymentModal.continueToPaymentAmount');
    expect(fixture.nativeElement.querySelector('.pm-secure').textContent).toContain('paymentModal.securePaymentDpo');
  });

  it('starts the payment without a phone, remembers it and where to return, then opens DPO', () => {
    create();
    payments.initiate.and.returnValue(of({ deposit_id: DEP, status: 'Pending', message: '', amount: 1000, currency: 'RWF', payment_url: DPO_URL }));
    payBtn().click();
    expect(payments.initiate).toHaveBeenCalledOnceWith({ movie_id: 12 });
    expect(payments.rememberPending).toHaveBeenCalledOnceWith('movie:12', DEP);
    expect(payments.rememberReturn).toHaveBeenCalledOnceWith(DEP, { kind: 'movie', movieId: 12 });
    expect(component.openExternal).toHaveBeenCalledOnceWith(DPO_URL);
    expect(payments.pollUntilSettled).not.toHaveBeenCalled();
    expect(component.success()).toBeFalse(); // success only after the server confirms, on /payment/return
  });

  it('refuses a payment_url that is not DPO or the demo checkout', () => {
    create();
    payments.initiate.and.returnValue(of({ deposit_id: DEP, status: 'Pending', message: '', amount: 1000, currency: 'RWF', payment_url: 'https://evil.example/pay' }));
    payBtn().click();
    fixture.detectChanges();
    expect(component.openExternal).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('paymentModal.errors.badPaymentPage');
  });

  it('409 with an open checkout offers to continue it instead of paying twice', () => {
    create();
    payments.initiate.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { error: 'in progress', deposit_id: DEP, payment_url: DPO_URL },
    })));
    payBtn().click();
    fixture.detectChanges();
    expect(component.openPayment()).toEqual({ depositId: DEP, paymentUrl: DPO_URL });
    component.continueOpen();
    expect(component.openExternal).toHaveBeenCalledOnceWith(DPO_URL);
    expect(payments.initiate).toHaveBeenCalledTimes(1);
  });

  it('cancelling the open checkout lets the buyer start again', () => {
    create();
    component.openPayment.set({ depositId: DEP, paymentUrl: DPO_URL });
    payments.cancel.and.returnValue(of({ status: 'Failed' as const, failure_reason: 'cancelled' as const }));
    component.cancelOpen();
    expect(payments.cancel).toHaveBeenCalledOnceWith(DEP);
    expect(payments.forgetPending).toHaveBeenCalledWith('movie:12');
    expect(component.openPayment()).toBeNull();
    expect(component.notice()).toBe('paymentModal.cancelled');
  });

  it('cancel that finds the payment already completed shows success', () => {
    create();
    component.openPayment.set({ depositId: DEP, paymentUrl: DPO_URL });
    payments.cancel.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    component.cancelOpen();
    expect(component.success()).toBeTrue();
  });

  it('a remembered open checkout is checked once and offered again', () => {
    create(DEP);
    expect(payments.checkStatus).toHaveBeenCalledOnceWith(DEP);
    expect(payments.pollUntilSettled).not.toHaveBeenCalled();
    expect(component.openPayment()).toEqual({ depositId: DEP, paymentUrl: DPO_URL });
  });

  it('the demo checkout opens inside the app', () => {
    create();
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    payments.paymentPageTarget.and.returnValue({ internal: `/payment/demo-checkout?deposit=${DEP}` });
    payments.initiate.and.returnValue(of({ deposit_id: DEP, status: 'Pending', message: '', amount: 1000, currency: 'RWF', demo: true, payment_url: `/payment/demo-checkout?deposit=${DEP}` }));
    payBtn().click();
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith(`/payment/demo-checkout?deposit=${DEP}`);
    expect(component.openExternal).not.toHaveBeenCalled();
  });
});
