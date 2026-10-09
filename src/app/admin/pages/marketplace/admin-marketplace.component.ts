import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminMarketplaceService } from '../../services/admin-marketplace.service';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import {
  ActorVideo, ActorVideoStatus, CastingCall, CastingCallStatus,
} from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
type Tab = 'videos' | 'casting';

interface ReasonDialog {
  kind: 'reject-video' | 'remove-video' | 'remove-call' | 'reject-call';
  id: number;
  title: string;
  required: boolean;
}

const VIDEO_STATUSES: ActorVideoStatus[] = [
  'pending_review', 'approved', 'rejected', 'removed', 'processing', 'upload_failed', 'pending_upload', 'replaced',
];

/** Casting calls waiting for a decision come first. */
const CALL_STATUSES: (CastingCallStatus | '')[] = ['pending_review', '', 'published', 'rejected', 'draft', 'closed', 'removed'];

@Component({
  selector: 'app-admin-marketplace',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent],
  templateUrl: './admin-marketplace.component.html',
  styleUrls: [
    '../movies/admin-movies.component.scss',
    './admin-marketplace.component.scss',
  ],
})
export class AdminMarketplaceComponent implements OnInit {
  private readonly marketplace = inject(AdminMarketplaceService);

  readonly videoStatuses = VIDEO_STATUSES;
  readonly callStatuses  = CALL_STATUSES;

  tab = signal<Tab>('videos');

  // ── Videos ────────────────────────────────────────────
  videos        = signal<ActorVideo[]>([]);
  videoStatus   = signal<ActorVideoStatus>('pending_review');
  videoPage     = signal(1);
  videoPages    = signal(0);
  videoTotal    = signal<number | null>(null);
  videosLoading = signal(false);
  videoSearch   = signal('');

  videoCounts    = signal<Partial<Record<ActorVideoStatus, number>>>({});
  countsLoading  = signal(true);

  filteredVideos = computed(() => {
    const q = this.videoSearch().toLowerCase().trim();
    if (!q) return this.videos();
    return this.videos().filter(v =>
      v.title?.toLowerCase().includes(q) ||
      String(v.actor_id).includes(q)
    );
  });

  kpiPending  = computed(() => this.videoCounts()['pending_review'] ?? null);
  kpiApproved = computed(() => this.videoCounts()['approved'] ?? null);
  kpiRejected = computed(() => this.videoCounts()['rejected'] ?? null);
  kpiTotal    = computed(() => {
    const c = this.videoCounts();
    const vals = Object.values(c) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });

  allClear = computed(() =>
    !this.countsLoading() && this.kpiPending() === 0
  );

  // ── Casting calls ─────────────────────────────────────
  calls        = signal<CastingCall[]>([]);
  callStatus   = signal<CastingCallStatus | ''>('pending_review');
  callPage     = signal(1);
  callPages    = signal(0);
  callTotal    = signal<number | null>(null);
  callsLoading = signal(false);
  callSearch   = signal('');

  filteredCalls = computed(() => {
    const q = this.callSearch().toLowerCase().trim();
    if (!q) return this.calls();
    return this.calls().filter(c =>
      c.title?.toLowerCase().includes(q) ||
      (c.producer_name ?? c.studio_name ?? '').toLowerCase().includes(q)
    );
  });

  // ── Shared dialog state ───────────────────────────────
  error          = signal<string | null>(null);
  actionId       = signal<number | null>(null);
  confirmApprove = signal<ActorVideo | null>(null);
  reasonDialog   = signal<ReasonDialog | null>(null);
  reason         = signal('');
  reasonError    = signal<string | null>(null);
  previewSrc     = signal<string | null>(null);

  // ─────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadStatusCounts();
    this.loadVideos(1);
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.error.set(null);
    if (t === 'casting' && this.calls().length === 0) this.loadCalls(1);
  }

  // ── Video status pill ─────────────────────────────────
  setVideoStatus(s: ActorVideoStatus): void {
    this.videoStatus.set(s);
    this.videoSearch.set('');
    this.loadVideos(1);
  }

  // ── Casting status pill ───────────────────────────────
  setCallStatus(s: CastingCallStatus | ''): void {
    this.callStatus.set(s);
    this.callSearch.set('');
    this.loadCalls(1);
  }

  // ── Parallel count loader ─────────────────────────────
  loadStatusCounts(): void {
    this.countsLoading.set(true);
    const reqs = VIDEO_STATUSES.map(s =>
      this.marketplace.listActorVideos(s, 1).pipe(
        catchError(() => of({ results: [], page: 1, total_results: 0, total_pages: 0 }))
      )
    );
    forkJoin(reqs).subscribe(results => {
      const counts: Partial<Record<ActorVideoStatus, number>> = {};
      VIDEO_STATUSES.forEach((s, i) => (counts[s] = results[i].total_results));
      this.videoCounts.set(counts);
      this.countsLoading.set(false);
    });
  }

  loadVideos(page = this.videoPage()): void {
    this.videosLoading.set(true);
    this.marketplace.listActorVideos(this.videoStatus(), page).subscribe({
      next: (res) => {
        this.videos.set(res.results);
        this.videoPage.set(res.page);
        this.videoPages.set(res.total_pages);
        this.videoTotal.set(res.total_results);
        this.videosLoading.set(false);
      },
      error: (err: HttpErrorResponse) => { this.videosLoading.set(false); this.fail(err); },
    });
  }

  loadCalls(page = this.callPage()): void {
    this.callsLoading.set(true);
    this.marketplace.listCastingCalls(this.callStatus(), page).subscribe({
      next: (res) => {
        this.calls.set(res.results);
        this.callPage.set(res.page);
        this.callPages.set(res.total_pages);
        this.callTotal.set(res.total_results);
        this.callsLoading.set(false);
      },
      error: (err: HttpErrorResponse) => { this.callsLoading.set(false); this.fail(err); },
    });
  }

  // ── Approve ───────────────────────────────────────────
  approve(): void {
    const v = this.confirmApprove();
    if (!v) return;
    this.actionId.set(v.id);
    this.marketplace.approveVideo(v.id).subscribe({
      next: () => {
        this.actionId.set(null);
        this.confirmApprove.set(null);
        this.loadVideos();
        this.loadStatusCounts();
      },
      error: (err: HttpErrorResponse) => {
        this.actionId.set(null);
        this.confirmApprove.set(null);
        this.fail(err);
      },
    });
  }

  // ── Reject / remove ───────────────────────────────────
  openReason(kind: ReasonDialog['kind'], id: number, title: string): void {
    this.reason.set('');
    this.reasonError.set(null);
    this.reasonDialog.set({ kind, id, title, required: kind !== 'remove-video' });
  }

  confirmReason(): void {
    const d = this.reasonDialog();
    if (!d) return;
    const reason = this.reason().trim();
    if (d.required && !reason) { this.reasonError.set('admin.marketplace.reasonRequired'); return; }
    const req: Observable<unknown> =
      d.kind === 'reject-video' ? this.marketplace.rejectVideo(d.id, reason) :
      d.kind === 'remove-video' ? this.marketplace.removeVideo(d.id, reason || undefined) :
      d.kind === 'reject-call' ? this.marketplace.rejectCastingCall(d.id, reason) :
      this.marketplace.removeCastingCall(d.id, reason);

    this.actionId.set(d.id);
    req.subscribe({
      next: () => {
        this.actionId.set(null);
        this.reasonDialog.set(null);
        if (d.kind === 'remove-call' || d.kind === 'reject-call') {
          this.loadCalls();
        } else {
          this.loadVideos();
          this.loadStatusCounts();
        }
      },
      error: (err: HttpErrorResponse) => {
        this.actionId.set(null);
        const body = err.error as { reason?: string } | null;
        this.reasonError.set(marketplaceErrorMessage(err) ?? body?.reason ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  /** Publish a paid casting call awaiting review (the server re-checks payment and deadline). */
  approveCall(c: CastingCall): void {
    this.actionId.set(c.id);
    this.error.set(null);
    this.marketplace.approveCastingCall(c.id).subscribe({
      next: () => { this.actionId.set(null); this.loadCalls(); },
      error: (err: HttpErrorResponse) => { this.actionId.set(null); this.fail(err); },
    });
  }

  preview(v: ActorVideo): void {
    if (v.video_url) this.previewSrc.set(v.video_url);
  }

  // ── Badge helpers ─────────────────────────────────────
  videoBadge(status: ActorVideoStatus): string {
    const map: Partial<Record<ActorVideoStatus, string>> = {
      approved:       'badge-approved',
      rejected:       'badge-rejected',
      removed:        'badge-removed',
      pending_review: 'badge-review',
      processing:     'badge-processing',
      pending_upload: 'badge-upload',
      upload_failed:  'badge-rejected',
      replaced:       'badge-removed',
    };
    return map[status] ?? 'badge-review';
  }

  callBadge(status: CastingCallStatus): string {
    const map: Partial<Record<CastingCallStatus, string>> = {
      published:      'badge-approved',
      removed:        'badge-rejected',
      rejected:       'badge-rejected',
      closed:         'badge-removed',
      draft:          'badge-upload',
      pending_review: 'badge-review',
    };
    return map[status] ?? 'badge-review';
  }

  statusPillClass(s: ActorVideoStatus, active: ActorVideoStatus): string {
    const base = s === active ? 'pill pill--active' : 'pill';
    const color = s === 'pending_review' ? 'pill--amber'
      : s === 'approved'       ? 'pill--green'
      : s === 'rejected'       ? 'pill--red'
      : s === 'removed'        ? 'pill--slate'
      : s === 'processing'     ? 'pill--blue'
      : 'pill--gray';
    return `${base} ${color}`;
  }

  callPillClass(s: CastingCallStatus | '', active: CastingCallStatus | ''): string {
    const base = s === active ? 'pill pill--active' : 'pill';
    const color = s === '' ? 'pill--slate'
      : s === 'published' ? 'pill--green'
      : s === 'removed' || s === 'rejected' ? 'pill--red'
      : s === 'closed'    ? 'pill--slate'
      : 'pill--amber';
    return `${base} ${color}`;
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
  }
}
