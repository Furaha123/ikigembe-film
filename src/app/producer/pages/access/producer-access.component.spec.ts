import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProducerAccessComponent } from './producer-access.component';
import { CastingService } from '../../services/casting.service';
import { AuthService, UserProfile } from '../../../core/services/auth.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { ServicePurchase } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const FUTURE = '2030-01-01T00:00:00Z';

describe('ProducerAccessComponent (My Access)', () => {
  let fixture: ComponentFixture<ProducerAccessComponent>;
  let casting: jasmine.SpyObj<CastingService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStub)?.componentInstance as PaymentModalStub | undefined;
  const click = (text: string) => {
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!.click();
    fixture.detectChanges();
  };
  /** Status → welcome → info → summary → payment modal. */
  const toPayment = () => {
    click('marketplace.access.getAccess');
    click('marketplace.wizard.next');
    click('marketplace.wizard.next');
    click('marketplace.access.pay');
  };

  beforeEach(() => {
    casting = jasmine.createSpyObj<CastingService>('CastingService', ['getSearchAccess', 'getQuote', 'purchaseSearch']);
    casting.getQuote.and.returnValue(of({ amount: 20000, currency: 'RWF', access_days: 30 }));
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getMe']);
    auth.getMe.and.returnValue(of({ first_name: 'Eric', last_name: 'M', email: 'e@studio.rw', studio_name: 'Studio', phone_number: '0788' } as UserProfile));
    TestBed.configureTestingModule({
      imports: [ProducerAccessComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: CastingService, useValue: casting },
        { provide: AuthService, useValue: auth },
      ],
    });
    TestBed.overrideComponent(ProducerAccessComponent, {
      remove: { imports: [PaymentModalComponent] },
      add: { imports: [PaymentModalStub] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ProducerAccessComponent);
    fixture.detectChanges();
  };

  it('shows active access with its exact expiry and a renewal action', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: FUTURE }));
    create();
    expect(el().textContent).toContain('marketplace.access.active');
    expect(el().textContent).toContain('2030');
    expect(el().textContent).toContain('marketplace.access.renew');
  });

  it('shows expired/never-bought access as inactive with a purchase path', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    expect(el().textContent).toContain('marketplace.access.inactive');
    expect(el().textContent).toContain('marketplace.access.getAccess');
  });

  it('shows the server price and duration, and buys through the shared payment modal', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    click('marketplace.access.getAccess');
    click('marketplace.wizard.next');
    expect(el().textContent).toContain('e@studio.rw'); // producer information, prefilled from the account
    click('marketplace.wizard.next');
    expect(el().textContent).toContain('20,000');
    click('marketplace.access.pay');
    expect(modal()?.service?.pendingKey).toBe('service:actor_search');
    casting.purchaseSearch.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 20000, currency: 'RWF' }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(casting.purchaseSearch).toHaveBeenCalledOnceWith('0788123456');
  });

  it('a pending or failed payment (modal closed without success) grants nothing', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    toPayment();
    modal()!.closed.emit();
    fixture.detectChanges();
    expect(modal()).toBeUndefined();
    expect(el().textContent).not.toContain('marketplace.access.granted');
    expect(el().textContent).toContain('marketplace.access.summaryTitle');
  });

  it('after a confirmed payment, reports access only once the server shows it', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    toPayment();
    // Server hasn't granted it yet.
    modal()!.paid.emit();
    fixture.detectChanges();
    expect(el().textContent).toContain('marketplace.access.awaitingGrant');
    expect(el().textContent).not.toContain('marketplace.access.granted');

    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: FUTURE }));
    click('marketplace.common.refresh');
    expect(el().textContent).toContain('marketplace.access.granted');
    expect(el().textContent).toContain('2030');
  });
});
