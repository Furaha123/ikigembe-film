import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { CastingWizardComponent, toLocalInput } from './casting-wizard.component';
import { CastingService } from '../../../services/casting.service';
import { AuthService, UserProfile } from '../../../../core/services/auth.service';
import { PaymentModalComponent } from '../../../../shared/components/payment-modal/payment-modal.component';
import { CastingCall, ServicePurchase } from '../../../../shared/models/marketplace.interface';

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const DEADLINE = toLocalInput(new Date(Date.now() + 7 * 86400000).toISOString());
const saved = (over: Partial<CastingCall> = {}): CastingCall => ({
  id: 42, producer_id: 1, producer_name: 'Eric', studio_name: 'Studio', title: 'Inzira', description: 'Drama',
  roles: ['Lead'], deadline_at: new Date(DEADLINE).toISOString(), status: 'draft', published_at: null,
  payment_status: null, created_at: '', updated_at: '', ...over,
});

describe('CastingWizardComponent (post casting)', () => {
  let fixture: ComponentFixture<CastingWizardComponent>;
  let casting: jasmine.SpyObj<CastingService>;
  let routeId: string | null;

  const el = () => fixture.nativeElement as HTMLElement;
  const cmp = () => fixture.componentInstance;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStub)?.componentInstance as PaymentModalStub | undefined;
  const type = (selector: string, value: string) => {
    const input = el().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const click = (text: string) => {
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!.click();
    fixture.detectChanges();
  };
  const fillToReview = () => {
    click('marketplace.wizard.next'); // type
    type('#cw-title', 'Inzira');
    type('#cw-desc', 'Drama in Musanze');
    type('#cw-deadline', DEADLINE);
    click('marketplace.wizard.next'); // details
    type('#cw-role-0', 'Lead, 20-30');
    click('marketplace.postCasting.toReview');
  };

  beforeEach(() => {
    sessionStorage.clear();
    routeId = null;
    casting = jasmine.createSpyObj<CastingService>('CastingService', ['getCall', 'createCall', 'updateCall', 'purchaseCall', 'getQuote']);
    casting.getQuote.and.returnValue(of({ amount: 20000, currency: 'RWF', access_days: null }));
    casting.createCall.and.returnValue(of(saved()));
    casting.updateCall.and.returnValue(of(saved()));
    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getMe']);
    auth.getMe.and.returnValue(of({ first_name: 'Eric', last_name: 'M', studio_name: 'Studio' } as UserProfile));
    TestBed.configureTestingModule({
      imports: [CastingWizardComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: CastingService, useValue: casting },
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useFactory: () => ({ snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } }) },
      ],
    });
    TestBed.overrideComponent(CastingWizardComponent, {
      remove: { imports: [PaymentModalComponent] },
      add: { imports: [PaymentModalStub] },
    });
  });
  afterEach(() => sessionStorage.clear());

  const create = () => {
    fixture = TestBed.createComponent(CastingWizardComponent);
    fixture.detectChanges();
  };

  it('blocks Next on missing details and keeps values when going back and forward', () => {
    create();
    click('marketplace.wizard.next');
    click('marketplace.wizard.next');
    expect(cmp().step()).toBe('details');

    type('#cw-title', 'Inzira');
    type('#cw-desc', 'Drama');
    type('#cw-deadline', DEADLINE);
    click('marketplace.wizard.next');
    expect(cmp().step()).toBe('roles');
    click('marketplace.wizard.back');
    expect(el().querySelector<HTMLInputElement>('#cw-title')!.value).toBe('Inzira');
    expect(el().querySelector<HTMLTextAreaElement>('#cw-desc')!.value).toBe('Drama');
  });

  it('rejects a deadline in the past', () => {
    create();
    click('marketplace.wizard.next');
    type('#cw-title', 'Inzira');
    type('#cw-desc', 'Drama');
    type('#cw-deadline', toLocalInput(new Date(Date.now() - 86400000).toISOString()));
    click('marketplace.wizard.next');
    expect(cmp().step()).toBe('details');
    expect(el().textContent).toContain('marketplace.producerCasting.deadlineFuture');
  });

  it('various roles keep a separate description per role', () => {
    create();
    cmp().chooseType('various');
    fixture.detectChanges();
    click('marketplace.wizard.next');
    type('#cw-title', 'Inzira');
    type('#cw-desc', 'Drama');
    type('#cw-deadline', DEADLINE);
    click('marketplace.wizard.next');
    type('#cw-role-0', 'Mother, 40s');
    click('marketplace.postCasting.addRole');
    type('#cw-role-1', 'Son, 10');
    click('marketplace.postCasting.toReview');
    click('marketplace.postCasting.saveDraft');
    expect(casting.createCall.calls.mostRecent().args[0].roles).toEqual(['Mother, 40s', 'Son, 10']);
  });

  it('review → edit a section keeps the rest', () => {
    create();
    fillToReview();
    expect(el().textContent).toContain('Lead, 20-30');
    [...el().querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent?.includes('marketplace.wizard.edit'))[0].click();
    fixture.detectChanges();
    expect(cmp().step()).toBe('details');
    type('#cw-title', 'Inzira II');
    click('marketplace.wizard.next');
    expect(el().querySelector<HTMLTextAreaElement>('#cw-role-0')!.value).toBe('Lead, 20-30');
  });

  it('restores an unsaved draft after a reload', () => {
    create();
    fillToReview();
    fixture.destroy();
    create();
    expect(cmp().step()).toBe('review');
    expect(el().textContent).toContain('Inzira');
    expect(el().textContent).toContain('Lead, 20-30');
  });

  it('saves the draft first, then opens the fee payment for that call', () => {
    create();
    fillToReview();
    click('marketplace.postCasting.payPublish');
    expect(casting.createCall).toHaveBeenCalledTimes(1);
    expect(modal()?.service?.pendingKey).toBe('service:casting:42');
    casting.purchaseCall.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 20000, currency: 'RWF' }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(casting.purchaseCall).toHaveBeenCalledOnceWith(42, '0788123456');
  });

  it('a payment closed without confirmation leaves the draft unpublished', () => {
    create();
    fillToReview();
    click('marketplace.postCasting.payPublish');
    casting.getCall.and.returnValue(of(saved({ payment_status: 'Pending' })));
    modal()!.closed.emit();
    fixture.detectChanges();
    expect(cmp().step()).toBe('review');
    expect(el().textContent).not.toContain('marketplace.publication.published');
  });

  it('after payment shows Published only when the server says so', () => {
    create();
    fillToReview();
    click('marketplace.postCasting.payPublish');
    casting.getCall.and.returnValue(of(saved({ payment_status: 'Completed' })));
    modal()!.paid.emit();
    fixture.detectChanges();
    expect(el().textContent).toContain('marketplace.publication.processing');
    expect(el().textContent).not.toContain('marketplace.publication.published');

    casting.getCall.and.returnValue(of(saved({ status: 'published', payment_status: 'Completed', published_at: '2030-01-01T00:00:00Z' })));
    click('marketplace.common.refresh');
    expect(el().textContent).toContain('marketplace.publication.published');
  });

  it('opens a non-draft call on its status instead of the editor', () => {
    routeId = '42';
    casting.getCall.and.returnValue(of(saved({ status: 'published', payment_status: 'Completed' })));
    create();
    expect(cmp().step()).toBe('result');
    expect(el().querySelector('#cw-title')).toBeNull();
  });
});
