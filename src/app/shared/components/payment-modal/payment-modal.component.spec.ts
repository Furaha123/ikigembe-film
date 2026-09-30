import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { PaymentModalComponent } from './payment-modal.component';
import { PaymentService, PaymentStatusResponse } from '../../../core/services/payment.service';
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
    payments = jasmine.createSpyObj<PaymentService>('PaymentService', ['initiate', 'pollUntilSettled', 'savePurchase']);
    payments.pollUntilSettled.and.returnValue(poll$);
    initiate = jasmine.createSpy('initiate').and.returnValue(of(accepted));

    TestBed.configureTestingModule({
      imports: [PaymentModalComponent],
      providers: [provideTranslateService(), { provide: PaymentService, useValue: payments }],
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
