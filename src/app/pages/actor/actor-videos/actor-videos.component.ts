import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { ALLOWED_VIDEO_EXTENSIONS, extensionList, hasAllowedExtension, VIDEO_ACCEPT } from '../../../shared/models/upload.constants';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import { ActorVideo } from '../../../shared/models/marketplace.interface';
import { actorVideoStatusClass } from '../../../shared/utils/marketplace-status';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

export interface VideoUploadState {
  pct: number;
  error: string | null; // translation key or backend message
  uploading: boolean;
}

@Component({
  selector: 'app-actor-videos',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, MarketplaceNavComponent, VideoPlayerComponent,
  ],
  templateUrl: './actor-videos.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorVideosComponent implements OnInit, OnDestroy {
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly uploader = inject(MultipartUploadService);
  private readonly translate = inject(TranslateService);

  readonly videoAccept = VIDEO_ACCEPT;

  videos   = signal<ActorVideo[]>([]);
  loading  = signal(true);
  error    = signal<string | null>(null);
  uploads  = signal<Record<number, VideoUploadState>>({});
  /** Signed URL of the video being previewed — cleared on close, never persisted. */
  previewSrc = signal<string | null>(null);

  readonly statusClass = actorVideoStatusClass;

  private controllers = new Map<number, AbortController>();

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.controllers.forEach(c => c.abort());
    this.controllers.clear();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.getMyVideos().subscribe({
      next: (list) => { this.videos.set(list); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  canUpload(v: ActorVideo): boolean {
    return v.status === 'pending_upload' && v.payment_status === 'Completed';
  }

  /**
   * Paid video still waiting for its file (e.g. the actor paid on a hosted page,
   * or left the talent wizard): multipart upload from here.
   */
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
