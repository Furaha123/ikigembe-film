import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, forkJoin, of, tap, throwError } from 'rxjs';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorProfileFormComponent } from '../actor-profile-form/actor-profile-form.component';
import { TalentVideoUploaderComponent } from '../talent-video-uploader/talent-video-uploader.component';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile, ActorVideo, ServicePurchase } from '../../../shared/models/marketplace.interface';
import { MAX_TALENT_VIDEO_SECONDS } from '../../../shared/models/upload.constants';
import { isAwaitingUpload } from '../../../shared/utils/marketplace-status';
import { apiErrorMessage } from '../../../shared/utils/api-error';

export type OnboardingStep = 'welcome' | 'profile' | 'video' | 'upload' | 'done';

/** Numbered steps shown in the progress bar (welcome and done are not counted). */
export const ONBOARDING_STEPS: readonly { id: OnboardingStep; labelKey: string }[] = [
  { id: 'profile', labelKey: 'marketplace.join.steps.profile' },
  { id: 'video',   labelKey: 'marketplace.join.steps.video' },
  { id: 'upload',  labelKey: 'marketplace.join.steps.upload' },
];

/**
 * "Show your talent" wizard: guidelines → actor profile → video details and
 * fee → upload → thank you. The backend requires the fee before the upload,
 * so payment happens at the video step. State lives in memory; a paid video
 * that was never uploaded is picked up again from GET /actor-videos/.
 */
@Component({
  selector: 'app-actor-onboarding',
  standalone: true,
  imports: [
    ReactiveFormsModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, ActorProfileFormComponent, TalentVideoUploaderComponent, PaymentModalComponent,
  ],
  templateUrl: './actor-onboarding.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorOnboardingComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly injector = inject(Injector);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  readonly steps = ONBOARDING_STEPS;
  readonly maxMinutes = MAX_TALENT_VIDEO_SECONDS / 60;

  step      = signal<OnboardingStep>('welcome');
  loading   = signal(true);
  loadError = signal<string | null>(null);
  profile   = signal<ActorProfile | null>(null);
  videos    = signal<ActorVideo[]>([]);
  purchase  = signal<ServicePurchase | null>(null);
  refreshFailed = signal(false);
  /** Video created by the payment started in this session. */
  private paidVideoId = signal<number | null>(null);

  /** 1-based position in the progress bar, 0 outside the numbered steps. */
  stepIndex = computed(() => this.steps.findIndex(s => s.id === this.step()) + 1);

  /** The video to upload: the one just paid for, else any earlier paid one. */
  awaitingVideo = computed(() => {
    const ready = this.videos().filter(isAwaitingUpload);
    return ready.find(v => v.id === this.paidVideoId()) ?? ready[0] ?? null;
  });

  paymentPending = computed(() =>
    this.videos().some(v => v.status === 'pending_upload' && v.payment_status === 'Pending'));

  videoForm = this.fb.nonNullable.group({
    title:       ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
  });

  ngOnInit(): void {
    forkJoin({
      profile: this.marketplace.getProfile().pipe(
        catchError((err: HttpErrorResponse) => err.status === 404 ? of(null) : throwError(() => err)),
      ),
      videos: this.marketplace.getMyVideos(),
    }).subscribe({
      next: ({ profile, videos }) => {
        this.profile.set(profile);
        this.videos.set(videos);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  /** Moves to a step and puts keyboard/screen-reader focus on its heading. */
  goTo(step: OnboardingStep): void {
    this.step.set(step);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  onProfileSaved(p: ActorProfile): void {
    this.profile.set(p);
    this.goTo('video');
  }

  startPurchase(): void {
    this.videoForm.markAllAsTouched();
    if (this.videoForm.invalid) return;
    const { title, description } = this.videoForm.getRawValue();
    this.purchase.set({
      titleKey: 'marketplace.videos.purchaseTitle',
      descriptionKey: 'marketplace.videos.purchaseDesc',
      initiate: (phone) => this.marketplace.purchaseVideo({
        title: title.trim(),
        description: description.trim() || undefined,
        phone_number: phone,
      }).pipe(tap(res => this.paidVideoId.set(res.actor_video_id ?? null))),
    });
  }

  onPaid(): void {
    this.purchase.set(null);
    this.videoForm.reset();
    this.refreshVideos();
  }

  /** The modal can be closed while the payment is still pending on the phone. */
  closePurchase(): void {
    this.purchase.set(null);
    this.refreshVideos();
  }

  /** Reloads the videos and moves on to the upload once a fee has settled. */
  refreshVideos(): void {
    this.refreshFailed.set(false);
    this.marketplace.getMyVideos().subscribe({
      next: (list) => {
        this.videos.set(list);
        if (this.step() === 'video' && this.awaitingVideo()) this.goTo('upload');
      },
      error: () => this.refreshFailed.set(true), // keep the current list; the actor can retry
    });
  }
}
