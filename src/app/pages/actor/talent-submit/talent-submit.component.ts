import {
  Component, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { WizardStepsComponent } from '../../../shared/components/wizard-steps/wizard-steps.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { DraftStoreService } from '../../../shared/services/draft-store.service';
import { MultipartUploadService, UploadAbortedError } from '../../../shared/services/multipart-upload.service';
import { extensionList } from '../../../shared/models/upload.constants';
import { ActorProfile, ActorVideo } from '../../../shared/models/marketplace.interface';
import { entitlementCode, marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { actorVideoStatusClass } from '../../../shared/utils/marketplace-status';
import { uploadErrorMessage } from '../../../shared/utils/upload-error';
import {
  TALENT_VIDEO_ACCEPT, TALENT_VIDEO_EXTENSIONS, TALENT_VIDEO_MAX_SECONDS, ageOn, formatDuration, formatFileSize, readVideoDuration, talentVideoProblem,
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
 * video → review → upload → submitted. Uploading needs the yearly actor membership
 * (no per-video fee): the server creates the video slot only for members (403
 * `membership_required` otherwise). The video goes live once the server's upload checks pass.
 */
@Component({
  selector: 'app-talent-submit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, MarketplaceNavComponent, WizardStepsComponent, ActorProfileFormComponent,
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
  private readonly route = inject(ActivatedRoute);
  /** Live video this submission replaces (from My talent videos → Replace); it stays live until the new one passes. */
  readonly replaces = signal<number | null>(null);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly profileForm = viewChild(ActorProfileFormComponent);

  readonly stepLabels = [
    'marketplace.talent.stepWelcome', 'marketplace.talent.stepDetails', 'marketplace.talent.stepVideo',
    'marketplace.talent.stepPay', 'marketplace.talent.stepDone',
  ];
  readonly videoAccept = TALENT_VIDEO_ACCEPT;
  readonly allowedTypes = extensionList(TALENT_VIDEO_EXTENSIONS);
  readonly maxMinutes = TALENT_VIDEO_MAX_SECONDS / 60;
  readonly statusClass = actorVideoStatusClass;
  readonly formatSize = formatFileSize;
  readonly formatDuration = formatDuration;

  step = signal<TalentStep>('welcome');
  profileLoading = signal(true);
  profileError = signal<string | null>(null);
  profile = signal<ActorProfile | null>(null);

  /** The yearly actor membership is active (null while unknown). Uploading needs it. */
  member = signal<boolean | null>(null);
  memberUntil = signal<string | null>(null);

  chosen = signal<ChosenVideo | null>(null);
  checkingFile = signal(false);
  fileError = signal<string | null>(null);
  /** The draft says a file was chosen before a reload: it must be picked again. */
  fileLost = signal(false);

  /** Video slot that receives the upload. */
  videoId = signal<number | null>(null);
  creating = signal(false);
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

  ngOnInit(): void {
    const replaces = Number(this.route.snapshot.queryParamMap.get('replaces'));
    if (Number.isInteger(replaces) && replaces > 0) this.replaces.set(replaces);
    this.restoreDraft();
    this.loadProfile();
    this.loadMembership();
  }

  loadMembership(): void {
    this.marketplace.getMembership().subscribe({
      next: (m) => { this.member.set(m.actor.active); this.memberUntil.set(m.actor.expires_at); },
      error: () => this.member.set(null), // unknown: the server still decides when the slot is created
    });
  }

  loadProfile(): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.marketplace.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.profileLoading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.profileLoading.set(false);
        if (err.status !== 404) this.profileError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
        // No profile yet: the details step creates it.
        if (this.stepIndex() > 1) this.goTo('details');
      },
    });
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  start(): void {
    this.goTo('details');
  }

  /** Details step: save the profile (new or edited), then continue. */
  onProfileSaved(p: ActorProfile): void {
    this.profile.set(p);
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
    const problem = talentVideoProblem(file.name, null, file.size);
    if (problem === 'type') {
      this.fileError.set(this.translate.instant('uploadErrors.videoType', { types: this.allowedTypes }));
      return;
    }
    if (problem === 'tooLarge') {
      this.fileError.set(this.translate.instant('marketplace.talent.tooLarge'));
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

  // ── Create the slot, then upload ───────────────────────────────────────

  /** Members only: the server creates the video slot (no fee), then the chosen file uploads into it. */
  submit(): void {
    if (this.creating() || this.uploading() || !this.chosen() || this.form.invalid) return;
    if (this.videoId()) {
      this.goTo('upload');
      this.upload();
      return;
    }
    const { title, description } = this.form.getRawValue();
    this.creating.set(true);
    this.uploadError.set(null);
    this.marketplace.createVideo({
      title: title.trim(),
      description: description.trim() || undefined,
      ...(this.replaces() ? { replaces: this.replaces()! } : {}),
    }).subscribe({
      next: (v) => {
        this.creating.set(false);
        this.videoId.set(v.id);
        this.goTo('upload');
        this.upload();
      },
      error: (err: unknown) => {
        this.creating.set(false);
        if (entitlementCode(err) === 'membership_required') this.member.set(false);
        this.uploadError.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.saveFailed');
      },
    });
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

  /** Show the server's status (being checked), never an assumed one. */
  private loadResult(id: number): void {
    this.goTo('done');
    this.marketplace.getMyVideos().subscribe({
      next: (list) => this.result.set(list.find(v => v.id === id) ?? null),
      error: () => this.result.set(null),
    });
  }

  /** Start again for another video (no fee while the membership is active). */
  submitAnother(): void {
    this.releasePreview();
    this.chosen.set(null);
    this.videoId.set(null);
    this.result.set(null);
    this.uploadPct.set(0);
    this.uploadError.set(null);
    this.form.reset();
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
