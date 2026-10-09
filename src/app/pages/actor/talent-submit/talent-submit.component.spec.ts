import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { TalentSubmitComponent } from './talent-submit.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService } from '../../../shared/services/multipart-upload.service';
import { ActorProfile, ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';
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

/** A birth date `years` years ago (plus a day, so the birthday has passed). */
const bornYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const profile = (years: number) => ({ stage_name: 'Aline', date_of_birth: bornYearsAgo(years), languages: [], skills: [] } as unknown as ActorProfile);
const paidVideo = { id: 9, title: 'Monologue', status: 'pending_review', payment_status: 'Completed' } as ActorVideo;

describe('TalentSubmitComponent (show your talent)', () => {
  let fixture: ComponentFixture<TalentSubmitComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  const api = {} as MultipartUploadApi;

  const el = () => fixture.nativeElement as HTMLElement;
  const cmp = () => fixture.componentInstance;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStubComponent)?.componentInstance as PaymentModalStubComponent | undefined;
  const settle = () => new Promise(r => setTimeout(r));

  /** Jump to the review step with a title and a chosen (unreadable-length) file. */
  async function toReview(): Promise<void> {
    cmp().step.set('video');
    fixture.detectChanges();
    cmp().form.setValue({ title: 'Monologue', description: '' });
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    await cmp().onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);
    cmp().toReview();
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessionStorage.clear();
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService',
      ['getProfile', 'getVideoQuote', 'purchaseVideo', 'videoUploadApi', 'getMyVideos', 'saveProfile']);
    marketplace.getVideoQuote.and.returnValue(of({ amount: 5000, currency: 'RWF', access_days: null }));
    marketplace.videoUploadApi.and.returnValue(api);
    marketplace.getMyVideos.and.returnValue(of([paidVideo]));
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    uploader.upload.and.resolveTo('key');

    TestBed.configureTestingModule({
      imports: [TalentSubmitComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        { provide: MultipartUploadService, useValue: uploader },
        provideMarketplaceUser(marketplaceUser('Viewer')),
      ],
    });
    TestBed.overrideComponent(TalentSubmitComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, PaymentModalComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent, PaymentModalStubComponent] },
    });
  });
  afterEach(() => sessionStorage.clear());

  const create = (p: ActorProfile) => {
    marketplace.getProfile.and.returnValue(of(p));
    fixture = TestBed.createComponent(TalentSubmitComponent);
    fixture.detectChanges();
  };

  it('labels an actor under 30 with the under-30 tier and shows the server amount', async () => {
    create(profile(25));
    await toReview();
    expect(el().textContent).toContain('marketplace.talent.tier_under30');
    expect(el().textContent).toContain('5,000');
  });

  it('labels an actor of 30 or more with the 30+ tier; the amount still comes from the server', async () => {
    marketplace.getVideoQuote.and.returnValue(of({ amount: 10000, currency: 'RWF', access_days: null }));
    create(profile(30));
    await toReview();
    expect(el().textContent).toContain('marketplace.talent.tier_from30');
    expect(el().textContent).toContain('10,000');
    expect(el().querySelector('select')).toBeNull(); // no way to pick a tier
  });

  it('needs a video before review', () => {
    create(profile(25));
    cmp().step.set('video');
    cmp().form.setValue({ title: 'Monologue', description: '' });
    cmp().toReview();
    fixture.detectChanges();
    expect(cmp().step()).toBe('video');
    expect(el().textContent).toContain('marketplace.talent.fileRequired');
  });

  it('rejects unsupported files before any payment', async () => {
    create(profile(25));
    cmp().step.set('video');
    await cmp().onFileSelected({ target: { files: [new File(['x'], 'clip.webm')], value: '' } } as unknown as Event);
    fixture.detectChanges();
    expect(cmp().chosen()).toBeNull();
    expect(cmp().fileError()).toBe('uploadErrors.videoType');
  });

  it('does not upload while the payment is unconfirmed (closed modal)', async () => {
    create(profile(25));
    await toReview();
    cmp().pay();
    fixture.detectChanges();
    marketplace.purchaseVideo.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF', actor_video_id: 9 }));
    modal()!.service!.initiate('0788123456').subscribe();
    modal()!.closed.emit();
    fixture.detectChanges();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(cmp().step()).toBe('review');
  });

  it('uploads to the paid video after the payment is confirmed, then shows the server status', async () => {
    create(profile(25));
    await toReview();
    cmp().pay();
    fixture.detectChanges();
    marketplace.purchaseVideo.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF', actor_video_id: 9 }));
    modal()!.service!.initiate(null).subscribe();
    expect(marketplace.purchaseVideo).toHaveBeenCalledOnceWith({ title: 'Monologue', description: undefined, phone_number: undefined });

    modal()!.paid.emit();
    expect(marketplace.videoUploadApi).toHaveBeenCalledWith(9);
    expect(uploader.upload).toHaveBeenCalledTimes(1);
    await settle();
    fixture.detectChanges();
    expect(cmp().step()).toBe('done');
    expect(el().textContent).toContain('marketplace.videoStatus.pending_review');
  });

  it('keeps the text draft across a reload and asks for the file again', async () => {
    create(profile(25));
    await toReview();
    fixture.destroy();
    create(profile(25));
    expect(cmp().step()).toBe('video');
    expect(cmp().form.controls.title.value).toBe('Monologue');
    expect(cmp().fileLost()).toBeTrue();
  });
});
