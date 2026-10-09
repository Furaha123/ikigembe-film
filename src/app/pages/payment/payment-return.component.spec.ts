import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EMPTY, of, throwError } from 'rxjs';
import { PaymentReturnComponent } from './payment-return.component';
import { PaymentService, PaymentStatusResponse } from '../../core/services/payment.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStubComponent {}

const DEP = '11111111-2222-3333-4444-555555555555';
const status = (over: Partial<PaymentStatusResponse>): PaymentStatusResponse => ({
  deposit_id: DEP, status: 'Pending', amount: 1000, currency: 'RWF', purpose: 'movie', movie_id: 12,
  movie_title: 'Umurage', created_at: '', ...over,
});

describe('PaymentReturnComponent', () => {
  let payments: jasmine.SpyObj<PaymentService>;
  let harness: RouterTestingHarness;
  let component: PaymentReturnComponent;

  async function open(url: string) {
    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(url, PaymentReturnComponent);
    harness.detectChanges();
  }
  const text = () => (harness.routeNativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    payments = jasmine.createSpyObj<PaymentService>('PaymentService',
      ['checkStatus', 'pollUntilSettled', 'forgetDeposit', 'returnContext', 'paymentPageTarget', 'cancel']);
    payments.pollUntilSettled.and.returnValue(EMPTY);
    payments.returnContext.and.returnValue(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'payment/return', component: PaymentReturnComponent }]),
        provideTranslateService(),
        { provide: PaymentService, useValue: payments },
      ],
    });
    TestBed.overrideComponent(PaymentReturnComponent, {
      remove: { imports: [HeaderComponent, FooterComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent] },
    });
  });

  it('rejects a missing or malformed deposit without calling the API', async () => {
    await open('/payment/return?deposit=../../etc');
    expect(component.state()).toBe('invalid');
    expect(payments.checkStatus).not.toHaveBeenCalled();
  });

  it('shows success only from the server, forgets the deposit and offers Watch now', async () => {
    payments.checkStatus.and.returnValue(of(status({ status: 'Completed' })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(component.state()).toBe('success');
    expect(payments.forgetDeposit).toHaveBeenCalledWith(DEP);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    component.watchNow();
    // Playback is requested through navigation state, never a URL parameter.
    expect(router.navigate).toHaveBeenCalledOnceWith(['/movie', 12], { state: { startPlayback: true } });
  });

  it('the redirect itself proves nothing: a Pending payment keeps polling, then offers to continue', async () => {
    payments.checkStatus.and.returnValue(of(status({ payment_url: 'https://secure.3gdirectpay.com/payv2.php?ID=T' })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(payments.pollUntilSettled).toHaveBeenCalledOnceWith(DEP);
    expect(component.state()).toBe('pending'); // polling completed while still Pending
    expect(text()).toContain('paymentModal.continuePayment');
  });

  it('explains why a payment failed', async () => {
    payments.checkStatus.and.returnValue(of(status({ status: 'Failed', failure_reason: 'expired' })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(component.state()).toBe('failed');
    expect(text()).toContain('paymentReturn.failedExpired');
    expect(component.nextPage()).toBe('/movie/12');
  });

  it('sends a marketplace purchase back to its page, by server purpose', async () => {
    payments.checkStatus.and.returnValue(of(status({ status: 'Completed', purpose: 'actor_search', movie_id: null, movie_title: null })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(component.movieId()).toBeNull();
    expect(component.nextPage()).toBe('/producer/actors');
  });

  it("someone else's deposit is shown as not found", async () => {
    payments.checkStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(component.state()).toBe('invalid');
  });

  it('a network error offers a retry, not a failure', async () => {
    payments.checkStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await open(`/payment/return?deposit=${DEP}`);
    expect(component.state()).toBe('error');
  });
});
