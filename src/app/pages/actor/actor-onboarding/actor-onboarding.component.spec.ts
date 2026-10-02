import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ActorOnboardingComponent } from './actor-onboarding.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { TalentVideoUploaderComponent } from '../talent-video-uploader/talent-video-uploader.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile, ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}
@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}
@Component({ selector: 'app-talent-video-uploader', template: '' })
class UploaderStub {
  @Input() video!: ActorVideo;
  @Output() uploaded = new EventEmitter<void>();
}

const profile: ActorProfile = {
  stage_name: 'Aline', bio: '', gender: 'female', location: 'Kigali', languages: [], skills: [],
  contact_email: '', contact_phone: '', is_listed: true, date_of_birth: '2000-01-01', created_at: '', updated_at: '',
};
const video = (over: Partial<ActorVideo> = {}): ActorVideo => ({
  id: 9, actor_id: 1, title: 'Monologue', description: '', status: 'pending_upload', reject_reason: null,
  payment_status: 'Completed', amount: 5000, video_url: null, reviewed_at: null, created_at: '', updated_at: '',
  ...over,
});

describe('ActorOnboardingComponent', () => {
  let fixture: ComponentFixture<ActorOnboardingComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const cmp = () => fixture.componentInstance;
  const find = <T>(type: new (...a: never[]) => T) =>
    fixture.debugElement.query(d => d.componentInstance instanceof type)?.componentInstance as T | undefined;

  beforeEach(() => {
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService', ['getProfile', 'getMyVideos', 'purchaseVideo', 'saveProfile']);
    marketplace.getProfile.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    marketplace.getMyVideos.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [ActorOnboardingComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: ActorMarketplaceService, useValue: marketplace }],
    });
    TestBed.overrideComponent(ActorOnboardingComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, PaymentModalComponent, TalentVideoUploaderComponent] },
      add: { imports: [HeaderStub, FooterStub, PaymentModalStub, UploaderStub] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ActorOnboardingComponent);
    fixture.detectChanges();
  };

  it('starts on the guidelines and treats a 404 profile as a new actor', () => {
    create();
    expect(cmp().step()).toBe('welcome');
    expect(cmp().profile()).toBeNull();
    expect(el().textContent).toContain('marketplace.join.ruleLength');
    expect(el().querySelector('.mk-steps')).toBeNull();
  });

  it('shows a load error for other failures', () => {
    marketplace.getProfile.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    create();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('marketplace.errors.loadFailed');
  });

  it('moves to the video step once the profile is saved', () => {
    create();
    cmp().goTo('profile');
    fixture.detectChanges();
    expect(el().querySelector('[aria-current="step"]')?.textContent).toContain('marketplace.join.steps.profile');

    cmp().onProfileSaved(profile);
    fixture.detectChanges();
    expect(cmp().step()).toBe('video');
  });

  it('pays for the video, remembers the new video id, and goes to the upload once paid', () => {
    marketplace.getProfile.and.returnValue(of(profile));
    create();
    cmp().goTo('video');
    fixture.detectChanges();

    const title = el().querySelector<HTMLInputElement>('#aj-title')!;
    title.value = 'Monologue';
    title.dispatchEvent(new Event('input'));
    el().querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
    fixture.detectChanges();

    marketplace.purchaseVideo.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF', actor_video_id: 12 }));
    find(PaymentModalStub)!.service!.initiate('0788123456').subscribe();
    expect(marketplace.purchaseVideo).toHaveBeenCalledOnceWith({ title: 'Monologue', description: undefined, phone_number: '0788123456' });

    marketplace.getMyVideos.and.returnValue(of([video({ id: 3, title: 'Older' }), video({ id: 12 })]));
    find(PaymentModalStub)!.paid.emit();
    fixture.detectChanges();

    expect(cmp().step()).toBe('upload');
    expect(find(UploaderStub)!.video.id).toBe(12);

    find(UploaderStub)!.uploaded.emit();
    fixture.detectChanges();
    expect(cmp().step()).toBe('done');
  });

  it('stays on the video step while the payment is still pending', () => {
    create();
    cmp().goTo('video');
    marketplace.getMyVideos.and.returnValue(of([video({ payment_status: 'Pending' })]));
    cmp().closePurchase();
    fixture.detectChanges();
    expect(cmp().step()).toBe('video');
    expect(el().textContent).toContain('marketplace.videos.paymentPending');
  });

  it('offers to resume an earlier paid video from the guidelines', () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    create();
    expect(el().textContent).toContain('marketplace.join.resume');
    cmp().goTo('upload');
    fixture.detectChanges();
    expect(find(UploaderStub)!.video.id).toBe(9);
  });
});
