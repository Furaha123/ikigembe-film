import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TalentVideoUploaderComponent } from './talent-video-uploader.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { VideoDurationService } from '../../../shared/services/video-duration.service';
import { ActorVideo } from '../../../shared/models/marketplace.interface';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';

const video: ActorVideo = {
  id: 9, actor_id: 1, title: 'Monologue', description: '', status: 'pending_upload', reject_reason: null,
  payment_status: 'Completed', amount: 5000, video_url: null, reviewed_at: null, created_at: '', updated_at: '',
};

describe('TalentVideoUploaderComponent', () => {
  let fixture: ComponentFixture<TalentVideoUploaderComponent>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  let durations: jasmine.SpyObj<VideoDurationService>;
  const api = {} as MultipartUploadApi;

  const el = () => fixture.nativeElement as HTMLElement;
  const settle = () => new Promise(r => setTimeout(r));
  const selectFile = (file: File) => {
    const input = el().querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };

  beforeEach(() => {
    const marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService', ['videoUploadApi']);
    marketplace.videoUploadApi.and.returnValue(api);
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    durations = jasmine.createSpyObj<VideoDurationService>('VideoDurationService', ['read']);

    TestBed.configureTestingModule({
      imports: [TalentVideoUploaderComponent],
      providers: [
        provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        { provide: MultipartUploadService, useValue: uploader },
        { provide: VideoDurationService, useValue: durations },
      ],
    });
    fixture = TestBed.createComponent(TalentVideoUploaderComponent);
    fixture.componentRef.setInput('video', video);
    fixture.detectChanges();
  });

  it('keeps the file input keyboard-reachable (not display:none)', () => {
    expect(el().querySelector('input[type="file"]')!.hasAttribute('hidden')).toBeFalse();
  });

  it('refuses a video longer than 3 minutes without uploading', async () => {
    durations.read.and.resolveTo(181);
    selectFile(new File(['x'], 'reel.mp4'));
    await settle();
    fixture.detectChanges();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('marketplace.videos.tooLong');
  });

  it('uploads when the duration is within the limit, then emits uploaded', async () => {
    durations.read.and.resolveTo(180);
    uploader.upload.and.resolveTo('key');
    const uploaded = jasmine.createSpy('uploaded');
    fixture.componentInstance.uploaded.subscribe(uploaded);

    selectFile(new File(['x'], 'reel.mp4'));
    await settle();

    expect(uploader.upload).toHaveBeenCalledOnceWith(jasmine.any(File), api, jasmine.objectContaining({ signal: jasmine.any(AbortSignal) }));
    expect(uploaded).toHaveBeenCalled();
  });

  it('still uploads when the browser cannot read the duration', async () => {
    durations.read.and.resolveTo(null);
    uploader.upload.and.resolveTo('key');
    selectFile(new File(['x'], 'reel.mkv'));
    await settle();
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the upload is cancelled', async () => {
    durations.read.and.resolveTo(30);
    uploader.upload.and.rejectWith(new UploadAbortedError());
    selectFile(new File(['x'], 'reel.mp4'));
    await settle();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')).toBeNull();
  });

  it('aborts an upload in progress when destroyed', async () => {
    durations.read.and.resolveTo(30);
    let signal: AbortSignal | undefined;
    uploader.upload.and.callFake((_f, _a, opts) => { signal = opts?.signal; return new Promise(() => {}); });
    selectFile(new File(['x'], 'reel.mp4'));
    await settle();
    fixture.destroy();
    expect(signal?.aborted).toBeTrue();
  });
});
