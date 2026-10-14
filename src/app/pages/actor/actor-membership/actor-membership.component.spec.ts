import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ActorMembershipComponent } from './actor-membership.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MembershipStatus, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { marketplaceUser, provideMarketplaceUser } from '../../../shared/testing/marketplace-session';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStubComponent {}
@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStubComponent {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const status = (expires: string | null): MembershipStatus => ({
  actor: { active: !!expires, expires_at: expires },
  producer: { plan: null, expires_at: null, can_view_directory: false, casting_included: false, legacy_search_until: null },
});

describe('ActorMembershipComponent', () => {
  let fixture: ComponentFixture<ActorMembershipComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStubComponent)?.componentInstance as PaymentModalStubComponent | undefined;
  const click = (text: string) => {
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!.click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService',
      ['getMembership', 'getMembershipQuote', 'purchaseMembership']);
    marketplace.getMembershipQuote.and.returnValue(of({ amount: 5000, currency: 'RWF', access_days: 365 }));
    TestBed.configureTestingModule({
      imports: [ActorMembershipComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        provideMarketplaceUser(marketplaceUser('Viewer')),
      ],
    });
    TestBed.overrideComponent(ActorMembershipComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, PaymentModalComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent, PaymentModalStubComponent] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ActorMembershipComponent);
    fixture.detectChanges();
  };

  it('shows an active membership with its end date and a renewal', () => {
    marketplace.getMembership.and.returnValue(of(status('2030-01-01T00:00:00Z')));
    create();
    expect(el().textContent).toContain('marketplace.membership.active');
    expect(el().textContent).toContain('2030');
    expect(el().textContent).toContain('marketplace.access.renew');
  });

  it('shows the yearly server price and buys through the shared payment modal', () => {
    marketplace.getMembership.and.returnValue(of(status(null)));
    create();
    expect(el().textContent).toContain('marketplace.membership.inactive');
    expect(el().querySelector('.mk-price')?.textContent).toContain('5,000');
    click('marketplace.membership.become');
    expect(modal()?.service?.pendingKey).toBe('service:actor_membership');
    marketplace.purchaseMembership.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF' }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(marketplace.purchaseMembership).toHaveBeenCalledOnceWith('0788123456');
  });

  it('reports the membership only once the server shows it after payment', () => {
    marketplace.getMembership.and.returnValue(of(status(null)));
    create();
    click('marketplace.membership.become');
    modal()!.paid.emit();
    fixture.detectChanges();
    expect(el().textContent).toContain('marketplace.membership.awaitingGrant');

    marketplace.getMembership.and.returnValue(of(status('2030-01-01T00:00:00Z')));
    click('marketplace.common.refresh');
    expect(el().textContent).toContain('marketplace.membership.granted');
    expect(el().textContent).toContain('marketplace.membership.active');
  });
});
