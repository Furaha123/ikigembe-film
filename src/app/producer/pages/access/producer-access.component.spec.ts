import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProducerAccessComponent } from './producer-access.component';
import { CastingService } from '../../services/casting.service';
import { AuthService, UserProfile } from '../../../core/services/auth.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { MembershipStatus, ProducerPlan, ServicePurchase } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStubComponent {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const FUTURE = '2030-01-01T00:00:00Z';
const status = (plan: ProducerPlan | null, expires: string | null = plan ? FUTURE : null, legacy: string | null = null): MembershipStatus => ({
  actor: { active: false, expires_at: null },
  producer: {
    plan, expires_at: expires, can_view_directory: !!plan || !!legacy,
    casting_included: plan === 'producer_full', legacy_search_until: legacy,
  },
});

describe('ProducerAccessComponent (My plan)', () => {
  let fixture: ComponentFixture<ProducerAccessComponent>;
  let casting: jasmine.SpyObj<CastingService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStubComponent)?.componentInstance as PaymentModalStubComponent | undefined;
  const click = (text: string) => {
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!.click();
    fixture.detectChanges();
  };
  const planCard = (plan: ProducerPlan) =>
    [...el().querySelectorAll<HTMLButtonElement>('.mk-choice')].find(b => b.textContent?.includes(`marketplace.access.plan.${plan}`))!;
  /** Status → choose plan → info → summary → payment modal. */
  const toPayment = (plan: ProducerPlan = 'producer_full') => {
    click('marketplace.access.getAccess');
    planCard(plan).click();
    fixture.detectChanges();
    click('marketplace.wizard.next');
    click('marketplace.wizard.next');
    click('marketplace.access.pay');
  };

  beforeEach(() => {
    casting = jasmine.createSpyObj<CastingService>('CastingService', ['getMembership', 'getQuote', 'purchasePlan']);
    casting.getQuote.and.callFake((service) => of({
      amount: service === 'producer_full_plan' ? 15000 : 10000, currency: 'RWF', access_days: 365,
    }));
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
      add: { imports: [PaymentModalStubComponent] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ProducerAccessComponent);
    fixture.detectChanges();
  };

  it('shows the active plan with its exact expiry, renewal and an upgrade from View-only', () => {
    casting.getMembership.and.returnValue(of(status('producer_view')));
    create();
    expect(el().textContent).toContain('marketplace.access.plan.producer_view');
    expect(el().textContent).toContain('2030');
    expect(el().textContent).toContain('marketplace.access.renew');
    expect(el().textContent).toContain('marketplace.access.upgrade');
  });

  it('shows no plan as inactive with a purchase path, and mentions a legacy pass still running', () => {
    casting.getMembership.and.returnValue(of(status(null, null, FUTURE)));
    create();
    expect(el().textContent).toContain('marketplace.access.inactive');
    expect(el().textContent).toContain('marketplace.access.getAccess');
    expect(el().textContent).toContain('marketplace.access.legacyPass');
  });

  it('compares both plans with server prices and buys the chosen one through the payment modal', () => {
    casting.getMembership.and.returnValue(of(status(null)));
    create();
    click('marketplace.access.getAccess');
    expect(el().textContent).toContain('15,000');
    expect(el().textContent).toContain('10,000');
    planCard('producer_view').click();
    fixture.detectChanges();
    click('marketplace.wizard.next');
    expect(el().textContent).toContain('e@studio.rw'); // producer information, prefilled from the account
    click('marketplace.wizard.next');
    expect(el().querySelector('.mk-price')?.textContent).toContain('10,000');
    click('marketplace.access.pay');
    expect(modal()?.service?.pendingKey).toBe('service:plan:producer_view');
    casting.purchasePlan.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 10000, currency: 'RWF' }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(casting.purchasePlan).toHaveBeenCalledOnceWith('producer_view', '0788123456');
  });

  it('does not sell View-only on top of an active Full plan', () => {
    casting.getMembership.and.returnValue(of(status('producer_full')));
    create();
    click('marketplace.access.renew');
    expect(planCard('producer_view').disabled).toBeTrue();
    expect(planCard('producer_full').getAttribute('aria-checked')).toBe('true');
  });

  it('a pending or failed payment (modal closed without success) grants nothing', () => {
    casting.getMembership.and.returnValue(of(status(null)));
    create();
    toPayment();
    modal()!.closed.emit();
    fixture.detectChanges();
    expect(modal()).toBeUndefined();
    expect(el().textContent).not.toContain('marketplace.access.granted');
    expect(el().textContent).toContain('marketplace.access.summaryTitle');
  });

  it('after a confirmed payment, reports the plan only once the server shows it', () => {
    casting.getMembership.and.returnValue(of(status(null)));
    create();
    toPayment();
    modal()!.paid.emit();
    fixture.detectChanges();
    expect(el().textContent).toContain('marketplace.access.awaitingGrant');
    expect(el().textContent).not.toContain('marketplace.access.granted');

    casting.getMembership.and.returnValue(of(status('producer_full')));
    click('marketplace.common.refresh');
    expect(el().textContent).toContain('marketplace.access.granted');
    expect(el().textContent).toContain('2030');
  });
});
