import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ActorVideosComponent } from './actor-videos.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService, UploadError } from '../../../shared/services/multipart-upload.service';
import { VideoDurationService } from '../../../shared/services/video-duration.service';
import { ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}
@Component({ selector: 'app-video-player', template: '' })
class PlayerStub { @Input() src = ''; @Input() autoplay = false; }
@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const video = (over: Partial<ActorVideo> = {}): ActorVideo => ({
  id: 9, actor_id: 1, title: 'Monologue', description: '', status: 'pending_upload', reject_reason: null,
  payment_status: 'Completed', amount: 5000, video_url: null, reviewed_at: null, created_at: '', updated_at: '',
  ...over,
});

describe('ActorVideosComponent', () => {
  let fixture: ComponentFixture<ActorVideosComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  const api = {} as MultipartUploadApi;

  const el = () => fixture.nativeElement as HTMLElement;
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStub)?.componentInstance as PaymentModalStub | undefined;
  const settle = () => new Promise(r => setTimeout(r));
  const selectFile = (file: File) => {
    const input = el().querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  beforeEach(() => {
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService', ['getMyVideos', 'purchaseVideo', 'videoUploadApi']);
    marketplace.getMyVideos.and.returnValue(of([]));
    marketplace.videoUploadApi.and.returnValue(api);
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);

    TestBed.configureTestingModule({
      imports: [ActorVideosComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        { provide: MultipartUploadService, useValue: uploader },
        { provide: VideoDurationService, useValue: { read: () => Promise.resolve(60) } },
      ],
    });
    TestBed.overrideComponent(ActorVideosComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, PaymentModalComponent, VideoPlayerComponent] },
      add: { imports: [HeaderStub, FooterStub, PaymentModalStub, PlayerStub] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ActorVideosComponent);
    fixture.detectChanges();
  };

  it('shows the empty state', () => {
    create();
    expect(el().textContent).toContain('marketplace.videos.empty');
  });

  it('purchase: requires a title, opens the payment modal, and the modal starts the fee deposit', () => {
    create();
    const submit = el().querySelector<HTMLButtonElement>('form button[type="submit"]')!;
    submit.click();
    fixture.detectChanges();
    expect(modal()).toBeUndefined();
    expect(el().textContent).toContain('marketplace.errors.required');

    const title = el().querySelector<HTMLInputElement>('#av-title')!;
    title.value = 'Monologue';
    title.dispatchEvent(new Event('input'));
    submit.click();
    fixture.detectChanges();

    expect(modal()?.service?.titleKey).toBe('marketplace.videos.purchaseTitle');
    marketplace.purchaseVideo.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 5000, currency: 'RWF', actor_video_id: 9 }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(marketplace.purchaseVideo).toHaveBeenCalledOnceWith({ title: 'Monologue', description: undefined, phone_number: '0788123456' });
  });

  it('after payment completes, reloads and offers the upload', () => {
    create();
    const title = el().querySelector<HTMLInputElement>('#av-title')!;
    title.value = 'Monologue';
    title.dispatchEvent(new Event('input'));
    el().querySelector<HTMLButtonElement>('form button[type="submit"]')!.click();
    fixture.detectChanges();

    marketplace.getMyVideos.and.returnValue(of([video()]));
    modal()!.paid.emit();
    fixture.detectChanges();

    expect(modal()).toBeUndefined();
    expect(marketplace.getMyVideos).toHaveBeenCalledTimes(2);
    expect(el().querySelector('input[type="file"]')).not.toBeNull();
  });

  it('uploads the file through the multipart helper bound to the video, then reloads', async () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    uploader.upload.and.resolveTo('actors/videos/9/x.mp4');
    create();

    const file = new File(['x'], 'reel.mp4', { type: 'video/mp4' });
    selectFile(file);
    await settle();

    expect(marketplace.videoUploadApi).toHaveBeenCalledOnceWith(9);
    expect(uploader.upload).toHaveBeenCalledOnceWith(file, api, jasmine.objectContaining({ signal: jasmine.any(AbortSignal) }));
    expect(marketplace.getMyVideos).toHaveBeenCalledTimes(2);
  });

  it('rejects non-video files without uploading', () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    create();
    selectFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    fixture.detectChanges();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('uploadErrors.videoType');
  });

  it('shows an upload error', async () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    uploader.upload.and.rejectWith(new Error('Part 1 failed (500)'));
    create();
    selectFile(new File(['x'], 'reel.mp4', { type: 'video/mp4' }));
    await settle();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('marketplace.videos.uploadFailed');
  });

  it('shows the reject reason and hides upload until the fee is paid', () => {
    marketplace.getMyVideos.and.returnValue(of([
      video({ id: 1, status: 'rejected', reject_reason: 'Too dark' }),
      video({ id: 2, payment_status: 'Pending' }),
    ]));
    create();
    expect(el().textContent).toContain('Too dark');
    expect(el().textContent).toContain('marketplace.videos.paymentPending');
    expect(el().querySelector('input[type="file"]')).toBeNull();
  });

  it('shows the translated session-expired message on a 403 session error', async () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    uploader.upload.and.rejectWith(new UploadError('session', 403, 'This upload does not belong to your account.'));
    create();
    selectFile(new File(['x'], 'reel.mp4', { type: 'video/mp4' }));
    await settle();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('uploadErrors.sessionExpired');
  });

  it('rejects .webm (no longer accepted by the backend) and accepts .MOV', async () => {
    marketplace.getMyVideos.and.returnValue(of([video()]));
    uploader.upload.and.resolveTo('actors/videos/9/x.mov');
    create();
    selectFile(new File(['x'], 'reel.webm', { type: 'video/webm' }));
    expect(uploader.upload).not.toHaveBeenCalled();
    selectFile(new File(['x'], 'REEL.MOV'));
    await settle();
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });
});
