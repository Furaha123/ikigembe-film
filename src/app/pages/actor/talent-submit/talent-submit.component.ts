import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { tap } from 'rxjs';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { WizardStepsComponent } from '../../../shared/components/wizard-steps/wizard-steps.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { DraftStoreService } from '../../../shared/services/draft-store.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { ALLOWED_VIDEO_EXTENSIONS, VIDEO_ACCEPT, extensionList } from '../../../shared/models/upload.constants';
import { ActorProfile, ActorVideo, ServicePurchase, ServiceQuote } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { actorVideoStatusClass } from '../../../shared/utils/marketplace-status';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import {
  TALENT_VIDEO_MAX_SECONDS, ageOn, formatDuration, formatFileSize, readVideoDuration, talentFeeTier, talentVideoProblem,
} from '../../../shared/utils/talent-video';
import { ActorProfileFormComponent } from '../actor-profile/actor-profile-form.component';

export type TalentStep = 'welcome' | 'details' | 'video' | 'review' | 'upload' | 'done';
const STEPS: readonly TalentStep[] = ['welcome', 'details', 'video', 'review', 'done'];

interface TalentDraft {
  step: TalentStep;
  title: string;
  description: string;
  /** A file had been chosen; after a reload it must be chosen again. */
  hadFile: boolean;
}

interface ChosenVideo {
  file: File;
  /** Object URL for the local preview; revoked when replaced or on leave. */
  previewUrl: string;
  duration: number | null;
}

/**
 * Show your talent: welcome → personal details (actor profile) → choose the
 * video → review & pay → upload → submitted. The backend only accepts the
 * upload after the fee is confirmed, so the chosen file waits in memory while
 * the actor pays, then uploads. Paid is not approved: every video is moderated.
 */
@Component({
  selector: 'app-talent-submit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, MarketplaceNavComponent, WizardStepsComponent,
    PaymentModalComponent, ActorProfileFormComponent,
  ],
  templateUrl: './talent-submit.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class TalentSubmitComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly uploader = inject(MultipartUploadService);
  private readonly drafts = inject(DraftStoreService);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly profileForm = viewChild(ActorProfileFormComponent);

  readonly stepLabels = [
    'marketplace.talent.stepWelcome', 'marketplace.talent.stepDetails', 'marketplace.talent.stepVideo',
    'marketplace.talent.stepPay', 'marketplace.talent.stepDone',
  ];
  readonly videoAccept = VIDEO_ACCEPT;
  readonly allowedTypes = extensionList(ALLOWED_VIDEO_EXTENSIONS);
  readonly maxMinutes = TALENT_VIDEO_MAX_SECONDS / 60;
  readonly statusClass = actorVideoStatusClass;
  readonly formatSize = formatFileSize;
  readonly formatDuration = formatDuration;

  step = signal<TalentStep>('welcome');
  profileLoading = signal(true);
  profileError = signal<string | null>(null);
  profile = signal<ActorProfile | null>(null);

  quote = signal<ServiceQuote | null>(null);
  quoteError = signal<string | null>(null);

  chosen = signal<ChosenVideo | null>(null);
  checkingFile = signal(false);
  fileError = signal<string | null>(null);
  /** The draft says a file was chosen before a reload: it must be picked again. */
  fileLost = signal(false);

  purchase = signal<ServicePurchase | null>(null);
  /** Paid video record that receives the upload. */
  videoId = signal<number | null>(null);
  uploading = signal(false);
  uploadPct = signal(0);
  uploadError = signal<string | null>(null);
  result = signal<ActorVideo | null>(null);

  private controller: AbortController | null = null;

  form = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: ['', Validators.maxLength(2000)],
  });

  readonly stepIndex = computed(() => {
    const s = this.step();
    return STEPS.indexOf(s === 'upload' ? 'review' : s);
  });
  readonly age = computed(() => ageOn(this.profile()?.date_of_birth));
  readonly tier = computed(() => talentFeeTier(this.profile()?.date_of_birth));

  ngOnInit(): void {
    this.restoreDraft();
    this.loadProfile();
  }

  loadProfile(): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.marketplace.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.profileLoading.set(false);
        this.loadQuote();
      },
      error: (err: HttpErrorResponse) => {
        this.profileLoading.set(false);
        if (err.status !== 404) this.profileError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
        // No profile yet: the details step creates it.
        if (this.stepIndex() > 1) this.goTo('details');
      },
    });
  }

  /** The server price for this actor (it needs the birth date). */
  loadQuote(): void {
    if (!this.profile()?.date_of_birth) return;
    this.quoteError.set(null);
    this.marketplace.getVideoQuote().subscribe({
      next: (q) => this.quote.set(q),
      error: (err: HttpErrorResponse) => this.quoteError.set(
        err.status === 503 ? 'marketplace.purchase.unavailable' : (marketplaceErrorMessage(err) ?? 'marketplace.purchase.quoteFailed'),
      ),
    });
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  start(): void {
    this.goTo('details');
  }

  /** Details step: save the profile (new or edited), then continue. */
  onProfileSaved(p: ActorProfile): void {
    this.profile.set(p);
    this.quote.set(null);
    this.loadQuote();
    this.goTo('video');
  }

  /** Details step without changes to save. */
  continueWithProfile(): void {
    if (this.profileForm()?.hasUnsavedChanges() || !this.profile()) {
      this.profileForm()?.save();
      return;
    }
    this.goTo('video');
  }

  toReview(): void {
    this.form.markAllAsTouched();
    if (!this.chosen()) this.fileError.set('marketplace.talent.fileRequired');
    if (this.form.invalid || !this.chosen() || this.checkingFile()) {
      this.focusFirstInvalid();
      return;
    }
    this.goTo('review');
  }

  back(): void {
    const order: TalentStep[] = ['welcome', 'details', 'video', 'review'];
    const i = order.indexOf(this.step());
    if (i > 0) this.goTo(order[i - 1]);
  }

  // ── File ───────────────────────────────────────────────────────────────

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.fileError.set(null);
    if (talentVideoProblem(file.name, null) === 'type') {
      this.fileError.set(this.translate.instant('uploadErrors.videoType', { types: this.allowedTypes }));
      return;
    }
    this.checkingFile.set(true);
    const duration = await readVideoDuration(file);
    this.checkingFile.set(false);
    if (talentVideoProblem(file.name, duration) === 'tooLong') {
      this.fileError.set(this.translate.instant('marketplace.talent.tooLong', { max: this.maxMinutes, actual: formatDuration(duration!) }));
      return;
    }
    this.releasePreview();
    this.chosen.set({ file, duration, previewUrl: URL.createObjectURL(file) });
    this.fileLost.set(false);
    this.saveDraft();
  }

  removeFile(): void {
    this.releasePreview();
    this.chosen.set(null);
    this.saveDraft();
  }

  // ── Payment, then upload ───────────────────────────────────────────────

  pay(): void {
    if (this.purchase() || this.uploading() || !this.chosen() || this.form.invalid) return;
    const { title, description } = this.form.getRawValue();
    this.purchase.set({
      titleKey: 'marketplace.videos.purchaseTitle',
      descriptionKey: 'marketplace.talent.purchaseDesc',
      quote: () => this.marketplace.getVideoQuote(),
      pendingKey: 'service:actor_video',
      // A hosted-page payment leaves this page (and the chosen file): finish the upload from My talent videos.
      returnTo: '/actor/videos',
      initiate: (phone) => this.marketplace.purchaseVideo({
        title: title.trim(),
        description: description.trim() || undefined,
        phone_number: phone ?? undefined,
      }).pipe(tap(res => { if (res.actor_video_id) this.videoId.set(res.actor_video_id); })),
    });
  }

  /** The server confirmed the fee: the video record now accepts the upload. */
  onPaid(): void {
    this.purchase.set(null);
    this.goTo('upload');
    if (this.videoId()) {
      this.upload();
      return;
    }
    // Resumed payment (started earlier): find the paid record still waiting for its file.
    this.marketplace.getMyVideos().subscribe({
      next: (list) => {
        const waiting = list.find(v => v.status === 'pending_upload' && v.payment_status === 'Completed');
        if (waiting) {
          this.videoId.set(waiting.id);
          this.upload();
        } else {
          this.uploadError.set('marketplace.talent.noPaidVideo');
        }
      },
      error: (err: unknown) => this.uploadError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed'),
    });
  }

  closePurchase(): void {
    this.purchase.set(null);
  }

  /** Upload step after a reload or a lost file: pick the same video again. */
  async onRetryFileSelected(event: Event): Promise<void> {
    await this.onFileSelected(event);
    if (this.chosen()) this.upload();
  }

  upload(): void {
    const id = this.videoId();
    const chosen = this.chosen();
    if (!id || !chosen || this.uploading()) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.uploading.set(true);
    this.uploadPct.set(0);
    this.uploadError.set(null);

    this.uploader.upload(chosen.file, this.marketplace.videoUploadApi(id), {
      signal: controller.signal,
      onProgress: pct => this.uploadPct.set(pct),
    }).then(() => {
      this.uploading.set(false);
      this.drafts.clear(this.draftKey);
      this.loadResult(id);
    }).catch((err: unknown) => {
      this.uploading.set(false);
      this.uploadError.set(err instanceof UploadAbortedError
        ? 'marketplace.talent.uploadCancelled'
        : uploadErrorMessage(err, 'marketplace.videos.uploadFailed'));
    }).finally(() => {
      if (this.controller === controller) this.controller = null;
    });
  }

  cancelUpload(): void {
    this.controller?.abort();
  }

  /** Show the server's status (pending review), never an assumed one. */
  private loadResult(id: number): void {
    this.goTo('done');
    this.marketplace.getMyVideos().subscribe({
      next: (list) => this.result.set(list.find(v => v.id === id) ?? null),
      error: () => this.result.set(null),
    });
  }

  /** Start again for another video (a new fee applies, as the server decides). */
  submitAnother(): void {
    this.releasePreview();
    this.chosen.set(null);
    this.videoId.set(null);
    this.result.set(null);
    this.uploadPct.set(0);
    this.uploadError.set(null);
    this.form.reset();
    this.quote.set(null);
    this.loadQuote();
    this.goTo('video');
  }

  // ── Leaving ────────────────────────────────────────────────────────────

  hasUnsavedChanges(): boolean {
    if (this.uploading()) return true;
    if (this.step() === 'upload' && this.uploadError()) return true;
    return !!this.chosen() && (this.step() === 'video' || this.step() === 'review');
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) e.preventDefault();
  }

  ngOnDestroy(): void {
    this.controller?.abort();
    this.releasePreview();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private goTo(step: TalentStep): void {
    this.step.set(step);
    this.saveDraft();
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => this.stepHeading()?.nativeElement.focus());
  }

  private releasePreview(): void {
    const url = this.chosen()?.previewUrl;
    if (url) URL.revokeObjectURL(url);
  }

  private focusFirstInvalid(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => document.querySelector<HTMLElement>('app-talent-submit [aria-invalid="true"]')?.focus());
  }

  private readonly draftKey = 'talent-video';

  private restoreDraft(): void {
    const d = this.drafts.load<TalentDraft>(this.draftKey);
    if (!d) return;
    this.form.patchValue({ title: d.title ?? '', description: d.description ?? '' });
    // Steps past choosing the file need the file, which a reload loses.
    const step = d.step === 'review' || d.step === 'upload' ? 'video' : d.step;
    if (step && STEPS.includes(step) && step !== 'done') this.step.set(step);
    if (d.hadFile) this.fileLost.set(true);
  }

  private saveDraft(): void {
    if (this.step() === 'done') return;
    const { title, description } = this.form.getRawValue();
    this.drafts.save<TalentDraft>(this.draftKey, { step: this.step(), title, description, hadFile: !!this.chosen() });
  }

  /** Text fields: keep the draft current. */
  onTextChange(): void {
    this.saveDraft();
  }
}
