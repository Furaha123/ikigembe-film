import { Component, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { VideoDurationService } from '../../../shared/services/video-duration.service';
import {
  ALLOWED_VIDEO_EXTENSIONS, MAX_TALENT_VIDEO_SECONDS, VIDEO_ACCEPT, extensionList, hasAllowedExtension,
} from '../../../shared/models/upload.constants';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import { ActorVideo } from '../../../shared/models/marketplace.interface';

/**
 * File picker + multipart upload for one paid talent video. Checks the file
 * type and length first; the upload is aborted when the component is destroyed.
 */
@Component({
  selector: 'app-talent-video-uploader',
  standalone: true,
  imports: [TranslatePipe],
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
  template: `
    @if (uploading()) {
      <div class="mk-progress" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100"
           [attr.aria-label]="'marketplace.videos.uploading' | translate">
        <div [style.width.%]="pct()"></div>
      </div>
      <div class="mk-row">
        <span class="mk-muted">{{ pct() }}%</span>
        <button type="button" class="mk-btn mk-btn--ghost" (click)="cancel()">{{ 'marketplace.common.cancel' | translate }}</button>
      </div>
    } @else {
      <label class="mk-btn" [class.mk-btn--disabled]="checking()">
        {{ (checking() ? 'marketplace.videos.checking' : 'marketplace.videos.upload') | translate }}
        <input type="file" class="mk-visually-hidden" [accept]="videoAccept" [disabled]="checking()" (change)="onFileSelected($event)" />
      </label>
      <p class="mk-hint">{{ 'marketplace.videos.limits' | translate: { minutes: maxMinutes, types: types } }}</p>
    }
    <div aria-live="polite">
      @if (error()) { <p class="mk-error" role="alert">{{ error()! | translate: { minutes: maxMinutes, types: types } }}</p> }
    </div>
  `,
})
export class TalentVideoUploaderComponent implements OnDestroy {
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly uploader = inject(MultipartUploadService);
  private readonly durations = inject(VideoDurationService);
  private readonly translate = inject(TranslateService);

  /** A video whose fee is paid (status pending_upload, payment Completed). */
  @Input({ required: true }) video!: ActorVideo;
  @Output() uploaded = new EventEmitter<void>();

  readonly videoAccept = VIDEO_ACCEPT;
  readonly maxMinutes = MAX_TALENT_VIDEO_SECONDS / 60;
  readonly types = extensionList(ALLOWED_VIDEO_EXTENSIONS);

  pct       = signal(0);
  uploading = signal(false);
  checking  = signal(false);
  /** Translation key or backend message. */
  error     = signal<string | null>(null);

  private controller: AbortController | null = null;

  ngOnDestroy(): void {
    this.controller?.abort();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);

    if (!hasAllowedExtension(file.name, ALLOWED_VIDEO_EXTENSIONS)) {
      this.error.set(this.translate.instant('uploadErrors.videoType', { types: this.types }));
      return;
    }

    this.checking.set(true);
    const seconds = await this.durations.read(file);
    this.checking.set(false);
    if (seconds !== null && seconds > MAX_TALENT_VIDEO_SECONDS) {
      this.error.set('marketplace.videos.tooLong');
      return;
    }

    this.upload(file);
  }

  cancel(): void {
    this.controller?.abort();
  }

  private upload(file: File): void {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.pct.set(0);
    this.uploading.set(true);

    this.uploader.upload(file, this.marketplace.videoUploadApi(this.video.id), {
      signal: controller.signal,
      onProgress: pct => this.pct.set(pct),
    }).then(() => {
      this.pct.set(100);
      this.uploaded.emit();
    }).catch((err: unknown) => {
      if (err instanceof UploadAbortedError) return; // user cancel or logout — stay silent
      this.error.set(uploadErrorMessage(err, 'marketplace.videos.uploadFailed'));
    }).finally(() => {
      if (this.controller === controller) {
        this.controller = null;
        this.uploading.set(false);
      }
    });
  }
}
