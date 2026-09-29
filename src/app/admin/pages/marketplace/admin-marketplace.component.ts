import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminMarketplaceService } from '../../services/admin-marketplace.service';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import {
  ActorVideo, ActorVideoStatus, CastingCall, CastingCallStatus,
} from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type Tab = 'videos' | 'casting';

/** Reason dialog state. `required` mirrors the backend: reject and casting removal need a reason. */
interface ReasonDialog {
  kind: 'reject-video' | 'remove-video' | 'remove-call';
  id: number;
  title: string;
  required: boolean;
}

@Component({
  selector: 'app-admin-marketplace',
  standalone: true,
  imports: [CommonModule, TranslatePipe, VideoPlayerComponent],
  templateUrl: './admin-marketplace.component.html',
  // Same look as the Films moderation screen (tabs, table, dialogs, action buttons).
  styleUrls: ['../movies/admin-movies.component.scss'],
})
export class AdminMarketplaceComponent implements OnInit {
  private readonly marketplace = inject(AdminMarketplaceService);

  readonly videoStatuses: ActorVideoStatus[] = ['pending_review', 'approved', 'rejected', 'removed', 'pending_upload', 'processing'];
  readonly callStatuses: (CastingCallStatus | '')[] = ['', 'published', 'draft', 'closed', 'removed'];

  tab = signal<Tab>('videos');

  videos          = signal<ActorVideo[]>([]);
  videoStatus     = signal<ActorVideoStatus>('pending_review');
  videoPage       = signal(1);
  videoPages      = signal(0);
  videosLoading   = signal(false);

  calls           = signal<CastingCall[]>([]);
  callStatus      = signal<CastingCallStatus | ''>('');
  callPage        = signal(1);
  callPages       = signal(0);
  callsLoading    = signal(false);

  error           = signal<string | null>(null);
  actionId        = signal<number | null>(null);
  confirmApprove  = signal<ActorVideo | null>(null);
  reasonDialog    = signal<ReasonDialog | null>(null);
  reason          = signal('');
  reasonError     = signal<string | null>(null);
  previewSrc      = signal<string | null>(null);

  ngOnInit(): void {
    this.loadVideos(1);
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.error.set(null);
    if (t === 'casting' && this.calls().length === 0) this.loadCalls(1);
  }

  loadVideos(page = this.videoPage()): void {
    this.videosLoading.set(true);
    this.marketplace.listActorVideos(this.videoStatus(), page).subscribe({
      next: (res) => {
        this.videos.set(res.results);
        this.videoPage.set(res.page);
        this.videoPages.set(res.total_pages);
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
        this.callsLoading.set(false);
      },
      error: (err: HttpErrorResponse) => { this.callsLoading.set(false); this.fail(err); },
    });
  }

  onVideoStatus(event: Event): void {
    this.videoStatus.set((event.target as HTMLSelectElement).value as ActorVideoStatus);
    this.loadVideos(1);
  }

  onCallStatus(event: Event): void {
    this.callStatus.set((event.target as HTMLSelectElement).value as CastingCallStatus | '');
    this.loadCalls(1);
  }

  // ── Approve (confirmation dialog) ─────────────────────
  approve(): void {
    const v = this.confirmApprove();
    if (!v) return;
    this.actionId.set(v.id);
    this.marketplace.approveVideo(v.id).subscribe({
      next: () => { this.actionId.set(null); this.confirmApprove.set(null); this.loadVideos(); },
      error: (err: HttpErrorResponse) => { this.actionId.set(null); this.confirmApprove.set(null); this.fail(err); },
    });
  }

  // ── Reject / remove (reason dialog) ───────────────────
  openReason(kind: ReasonDialog['kind'], id: number, title: string): void {
    this.reason.set('');
    this.reasonError.set(null);
    this.reasonDialog.set({ kind, id, title, required: kind !== 'remove-video' });
  }

  confirmReason(): void {
    const d = this.reasonDialog();
    if (!d) return;
    const reason = this.reason().trim();
    if (d.required && !reason) {
      this.reasonError.set('admin.marketplace.reasonRequired');
      return;
    }
    const req =
      d.kind === 'reject-video' ? this.marketplace.rejectVideo(d.id, reason) :
      d.kind === 'remove-video' ? this.marketplace.removeVideo(d.id, reason || undefined) :
      this.marketplace.removeCastingCall(d.id, reason);

    this.actionId.set(d.id);
    req.subscribe({
      next: () => {
        this.actionId.set(null);
        this.reasonDialog.set(null);
        if (d.kind === 'remove-call') this.loadCalls(); else this.loadVideos();
      },
      error: (err: HttpErrorResponse) => {
        this.actionId.set(null);
        // 400 may be { reason: "..." } or { error: "..." }
        const body = err.error as { reason?: string } | null;
        this.reasonError.set(apiErrorMessage(err) ?? body?.reason ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  preview(v: ActorVideo): void {
    if (v.video_url) this.previewSrc.set(v.video_url);
  }

  videoBadge(status: ActorVideoStatus): string {
    return status === 'approved' ? 'badge-approved' :
      status === 'rejected' || status === 'removed' ? 'badge-rejected' : 'badge-review';
  }

  callBadge(status: CastingCallStatus): string {
    return status === 'published' ? 'badge-approved' : status === 'removed' ? 'badge-rejected' : 'badge-review';
  }

  private fail(err: HttpErrorResponse): void {
    this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.actionFailed');
  }
}
