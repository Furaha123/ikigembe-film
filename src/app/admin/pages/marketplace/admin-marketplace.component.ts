import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminMarketplaceService } from '../../services/admin-marketplace.service';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import {
  ActorVideo, ActorVideoStatus, CastingCall, CastingCallStatus,
} from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
type Tab = 'videos' | 'casting';

interface ReasonDialog {
  kind: 'remove-video' | 'remove-call';
  id: number;
  title: string;
  required: boolean;
}

/** Videos go live when the server's upload checks pass; admins only take them down afterwards. */
const VIDEO_STATUSES: ActorVideoStatus[] = [
  'approved', 'removed', 'processing', 'upload_failed', 'pending_upload', 'replaced',
];

/** Casting calls publish once paid; admins only take them down afterwards. */
const CALL_STATUSES: (CastingCallStatus | '')[] = ['', 'published', 'draft', 'closed', 'removed'];

@Component({
  selector: 'app-admin-marketplace',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent, AdminSectionTabsComponent],
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
  videoStatus   = signal<ActorVideoStatus>('approved');
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
      v.actor_name?.toLowerCase().includes(q) ||
      v.actor_email?.toLowerCase().includes(q) ||
      String(v.actor_id).includes(q)
    );
  });

  /** Avatar letters: "Uwase Aline" → "UA"; the id's first digit when the actor has no name. */
  actorInitials(v: ActorVideo): string {
    const words = (v.actor_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return String(v.actor_id).slice(0, 1);
    return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)).toUpperCase();
  }

  kpiApproved   = computed(() => this.videoCounts()['approved'] ?? null);
  kpiProcessing = computed(() => this.videoCounts()['processing'] ?? null);
  kpiRemoved    = computed(() => this.videoCounts()['removed'] ?? null);
  kpiTotal    = computed(() => {
    const c = this.videoCounts();
    const vals = Object.values(c) as number[];
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });

  // ── Casting calls ─────────────────────────────────────
  calls        = signal<CastingCall[]>([]);
  callStatus   = signal<CastingCallStatus | ''>('');
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

  // ── Remove ───────────────────────────────────
  openReason(kind: ReasonDialog['kind'], id: number, title: string): void {
    this.reason.set('');
    this.reasonError.set(null);
    this.reasonDialog.set({ kind, id, title, required: kind === 'remove-call' });
  }

  confirmReason(): void {
    const d = this.reasonDialog();
    if (!d) return;
    const reason = this.reason().trim();
    if (d.required && !reason) { this.reasonError.set('admin.marketplace.reasonRequired'); return; }
    const req: Observable<unknown> = d.kind === 'remove-video'
      ? this.marketplace.removeVideo(d.id, reason || undefined)
      : this.marketplace.removeCastingCall(d.id, reason);

    this.actionId.set(d.id);
    req.subscribe({
      next: () => {
        this.actionId.set(null);
        this.reasonDialog.set(null);
        if (d.kind === 'remove-call') {
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
    const color = s === 'approved' ? 'pill--green'
      : s === 'removed'        ? 'pill--slate'
      : s === 'processing'     ? 'pill--blue'
      : 'pill--gray';
    return `${base} ${color}`;
  }

  callPillClass(s: CastingCallStatus | '', active: CastingCallStatus | ''): string {
    const base = s === active ? 'pill pill--active' : 'pill';
    const color = s === '' ? 'pill--slate'
      : s === 'published' ? 'pill--green'
      : s === 'removed'   ? 'pill--red'
      : s === 'closed'    ? 'pill--slate'
      : 'pill--amber';
    return `${base} ${color}`;
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
  }
}
