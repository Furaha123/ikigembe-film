import {
  Component, ElementRef, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { WizardStepsComponent } from '../../../shared/components/wizard-steps/wizard-steps.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { DraftStoreService } from '../../../shared/services/draft-store.service';
import { MarketplaceAccessService } from '../../../core/access/marketplace-access.service';
import { ActorProfile, ActorVideo, CastingApplication, CastingCall } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import {
  applicationStatusClass, castingCallStatusClass, castingDisplayStatus, castingIsOpen,
} from '../../../shared/utils/marketplace-status';
import { ageOn } from '../../../shared/utils/talent-video';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ReportButtonComponent } from '../../../shared/components/report-button/report-button.component';

/** details → form → review → done. */
export type ApplyStep = 'details' | 'form' | 'review' | 'done';

const APPLY_STEPS: readonly ApplyStep[] = ['form', 'review', 'done'];

interface ApplyDraft {
  note: string;
  videoIds: number[];
}

/**
 * A casting call and, for active actor accounts, the application journey.
 * The application carries a message and approved talent videos; everything
 * else the producer sees comes from the actor profile, so it is shown here
 * read-only with a link to edit it. The message and chosen videos are kept
 * as a session draft, so leaving the page loses nothing.
 */
@Component({
  selector: 'app-casting-call-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslatePipe,
    HeaderComponent, FooterComponent, MarketplaceNavComponent, WizardStepsComponent,
    ReportButtonComponent,
  ],
  templateUrl: './casting-call-detail.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class CastingCallDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly drafts = inject(DraftStoreService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly access = inject(MarketplaceAccessService);
  private readonly analytics = inject(AnalyticsService);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  /** Only active viewer (actor) accounts can apply; producers just read the call. */
  readonly canApply = computed(() => this.access.can('apply-casting'));
  readonly stepLabels = ['marketplace.apply.stepForm', 'marketplace.apply.stepReview', 'marketplace.apply.stepDone'];
  readonly statusClass = castingCallStatusClass;
  readonly applicationClass = applicationStatusClass;
  readonly displayStatus = castingDisplayStatus;

  call        = signal<CastingCall | null>(null);
  loading     = signal(true);
  loadError   = signal<string | null>(null);
  /** Actor data (only fetched when the account can apply). */
  profile     = signal<ActorProfile | null>(null);
  profileMissing = signal(false);
  myVideos    = signal<ActorVideo[]>([]);
  existing    = signal<CastingApplication | null>(null);
  actorDataLoading = signal(false);

  step        = signal<ApplyStep>('details');
  selectedIds = signal<Set<number>>(new Set());
  note        = signal('');
  applying    = signal(false);
  applyError  = signal<string | null>(null);
  unavailable = signal(false);
  now = signal(Date.now());
  private clock?: ReturnType<typeof setTimeout>;
  private callId = 0;

  readonly stepIndex = computed(() => Math.max(0, APPLY_STEPS.indexOf(this.step())));
  isOpen = computed(() => {
    const call = this.call();
    return !!call && !this.unavailable() && castingIsOpen(call, this.now());
  });
  approvedVideos = computed(() => this.myVideos().filter(v => v.status === 'approved'));
  selectedVideos = computed(() => this.approvedVideos().filter(v => this.selectedIds().has(v.id)));
  age = computed(() => ageOn(this.profile()?.date_of_birth));

  ngOnInit(): void {
    this.callId = Number(this.route.snapshot.paramMap.get('id'));
    this.restoreDraft();
    this.marketplace.getCastingCall(this.callId).subscribe({
      next: (c) => {
        this.call.set(c); this.loading.set(false); this.scheduleDeadline(c);
        this.analytics.track('casting_view', { object_type: 'casting_call', object_id: c.id });
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err.status === 404 ? 'marketplace.casting.notFound' : (marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed'));
      },
    });
    if (this.canApply()) this.loadActorData();
  }

  /** Profile, approved videos and an earlier application to this call. */
  private loadActorData(): void {
    this.actorDataLoading.set(true);
    let pending = 3;
    const done = () => { if (--pending === 0) this.actorDataLoading.set(false); };
    this.marketplace.getProfile().subscribe({
      next: (p) => { this.profile.set(p); done(); },
      error: (err: HttpErrorResponse) => { if (err.status === 404) this.profileMissing.set(true); done(); },
    });
    this.marketplace.getMyVideos().subscribe({
      next: (list) => {
        this.myVideos.set(list);
        // Drop draft selections that are no longer approved videos.
        const ok = new Set(list.filter(v => v.status === 'approved').map(v => v.id));
        this.selectedIds.update(s => new Set([...s].filter(id => ok.has(id))));
        done();
      },
      error: () => { this.myVideos.set([]); done(); },
    });
    this.marketplace.getMyApplications().subscribe({
      next: (list) => { this.existing.set(list.find(a => a.casting_call_id === this.callId) ?? null); done(); },
      error: () => done(),
    });
  }

  // ── Steps ──────────────────────────────────────────────────────────────

  startApplication(): void {
    if (!this.canApply() || !this.isOpen() || this.existing() || this.profileMissing()) return;
    this.goTo('form');
  }

  toReview(): void {
    if (this.step() !== 'form') return;
    this.saveDraft();
    this.goTo('review');
  }

  /** Back to the form with every value kept. */
  edit(): void {
    if (this.applying()) return;
    this.goTo('form');
  }

  backToDetails(): void {
    this.saveDraft();
    this.goTo('details');
  }

  toggleVideo(id: number): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    this.saveDraft();
  }

  onNoteChange(value: string): void {
    this.note.set(value);
    this.saveDraft();
  }

  /** Confirm & submit: one request; repeated clicks and a second application are refused. */
  apply(): void {
    const c = this.call();
    this.now.set(Date.now());
    if (!c || !this.canApply() || this.step() !== 'review' || this.applying() || this.existing() || !this.isOpen()) return;
    this.applying.set(true);
    this.applyError.set(null);
    this.marketplace.apply(c.id, {
      note: this.note().trim() || undefined,
      video_ids: [...this.selectedIds()],
    }).subscribe({
      next: (application) => {
        this.applying.set(false);
        this.existing.set(application);
        this.drafts.clear(this.draftKey);
        this.goTo('done');
      },
      error: (err: HttpErrorResponse) => {
        this.applying.set(false);
        if (err.status === 404) {
          this.unavailable.set(true);
          this.drafts.clear(this.draftKey);
          this.goTo('details');
          return;
        }
        if (err.status === 409) {
          // Already applied (another tab or device): show that application instead.
          this.drafts.clear(this.draftKey);
          this.refreshExisting();
          this.goTo('details');
          return;
        }
        this.applyError.set(marketplaceErrorMessage(err) ?? 'marketplace.casting.applyFailed');
      },
    });
  }

  private refreshExisting(): void {
    this.marketplace.getMyApplications().subscribe({
      next: (list) => this.existing.set(list.find(a => a.casting_call_id === this.callId) ?? null),
      error: () => { /* the status stays unknown; the 409 already stopped a duplicate */ },
    });
  }

  private goTo(step: ApplyStep): void {
    this.step.set(step);
    if (!isPlatformBrowser(this.platformId)) return;
    // Move focus to the new step's heading once it renders.
    setTimeout(() => this.stepHeading()?.nativeElement.focus());
  }

  // ── Draft (message + chosen videos only) ───────────────────────────────

  private get draftKey(): string {
    return `apply:${this.callId}`;
  }

  private restoreDraft(): void {
    const d = this.drafts.load<ApplyDraft>(this.draftKey);
    if (!d) return;
    if (typeof d.note === 'string') this.note.set(d.note);
    if (Array.isArray(d.videoIds)) this.selectedIds.set(new Set(d.videoIds.filter(n => Number.isInteger(n))));
  }

  private saveDraft(): void {
    this.drafts.save<ApplyDraft>(this.draftKey, { note: this.note(), videoIds: [...this.selectedIds()] });
  }

  private scheduleDeadline(call: CastingCall): void {
    clearTimeout(this.clock);
    this.now.set(Date.now());
    if (!isPlatformBrowser(this.platformId) || !castingIsOpen(call, this.now())) return;
    // Long deadlines are chunked to stay within the browser's signed 32-bit timer limit.
    const delay = Math.min(new Date(call.deadline_at).getTime() - this.now(), 2147483647);
    this.clock = setTimeout(() => this.scheduleDeadline(call), delay);
  }

  ngOnDestroy(): void { clearTimeout(this.clock); }
}
