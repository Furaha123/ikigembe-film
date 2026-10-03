import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../actor-nav/actor-nav.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { ALLOWED_VIDEO_EXTENSIONS, extensionList, hasAllowedExtension, VIDEO_ACCEPT } from '../../../shared/models/upload.constants';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import { ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { actorVideoStatusClass } from '../../../shared/utils/marketplace-status';
import { apiErrorMessage } from '../../../shared/utils/api-error';

export interface VideoUploadState {
  pct: number;
  error: string | null; // translation key or backend message
  uploading: boolean;
}

@Component({
  selector: 'app-actor-videos',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, ActorNavComponent, PaymentModalComponent, VideoPlayerComponent,
  ],
  templateUrl: './actor-videos.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorVideosComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly uploader = inject(MultipartUploadService);
  private readonly translate = inject(TranslateService);

  readonly videoAccept = VIDEO_ACCEPT;

  videos   = signal<ActorVideo[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  uploads  = signal<Record<number, VideoUploadState>>({});
  purchase = signal<ServicePurchase | null>(null);
  /** Signed URL of the video being previewed — cleared on close, never persisted. */
  previewSrc = signal<string | null>(null);

  readonly statusClass = actorVideoStatusClass;

  private controllers = new Map<number, AbortController>();

  form = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.controllers.forEach(c => c.abort());
    this.controllers.clear();
  }

  load(): void {
    this.marketplace.getMyVideos().subscribe({
      next: (list) => { this.videos.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Step 1: pay the upload fee. The actor_video record is created with the payment. */
  startPurchase(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { title, description } = this.form.getRawValue();
    this.purchase.set({
      titleKey: 'marketplace.videos.purchaseTitle',
      descriptionKey: 'marketplace.videos.purchaseDesc',
      quote: () => this.marketplace.getVideoQuote(),
      pendingKey: 'service:actor_video',
      returnTo: '/actor/videos',
      initiate: (phone) => this.marketplace.purchaseVideo({
        title: title.trim(),
        description: description.trim() || undefined,
        phone_number: phone ?? undefined,
      }),
    });
  }

  /** Step 2 (after polling completes): the paid video appears as pending_upload. */
  onPaid(): void {
    this.purchase.set(null);
    this.form.reset();
    this.load();
  }

  closePurchase(): void {
    this.purchase.set(null);
    this.load(); // a payment may have been started before the modal closed
  }

  canUpload(v: ActorVideo): boolean {
    return v.status === 'pending_upload' && v.payment_status === 'Completed';
  }

  /** Step 3: multipart upload of the talent video. */
  onFileSelected(video: ActorVideo, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      this.setUpload(video.id, { pct: 0, uploading: false, error: this.translate.instant('uploadErrors.videoType', { types: extensionList(ALLOWED_VIDEO_EXTENSIONS) }) });
      return;
    }

    this.controllers.get(video.id)?.abort();
    const controller = new AbortController();
    this.controllers.set(video.id, controller);
    this.setUpload(video.id, { pct: 0, uploading: true, error: null });

    this.uploader.upload(file, this.marketplace.videoUploadApi(video.id), {
      signal: controller.signal,
      onProgress: pct => this.setUpload(video.id, { pct, uploading: true, error: null }),
    }).then(() => {
      this.setUpload(video.id, { pct: 100, uploading: false, error: null });
      this.load();
    }).catch((err: unknown) => {
      if (err instanceof UploadAbortedError) {
        this.setUpload(video.id, { pct: 0, uploading: false, error: null });
        return;
      }
      this.setUpload(video.id, {
        pct: 0, uploading: false,
        error: uploadErrorMessage(err, 'marketplace.videos.uploadFailed'),
      });
    }).finally(() => {
      if (this.controllers.get(video.id) === controller) this.controllers.delete(video.id);
    });
  }

  cancelUpload(video: ActorVideo): void {
    this.controllers.get(video.id)?.abort();
  }

  preview(v: ActorVideo): void {
    if (v.video_url) this.previewSrc.set(v.video_url);
  }

  closePreview(): void {
    this.previewSrc.set(null);
  }

  private setUpload(id: number, state: VideoUploadState): void {
    this.uploads.update(m => ({ ...m, [id]: state }));
  }
}
