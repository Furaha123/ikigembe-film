import { Component, OnInit, OnDestroy, computed, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../../actor/actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorVideo, CastingCall } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { castingDisplayStatus, castingIsOpen, castingCallStatusClass } from '../../../shared/utils/marketplace-status';

@Component({
  selector: 'app-casting-call-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent],
  templateUrl: './casting-call-detail.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class CastingCallDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly platformId = inject(PLATFORM_ID);

  call        = signal<CastingCall | null>(null);
  loading     = signal(true);
  loadError   = signal<string | null>(null);
  myVideos    = signal<ActorVideo[]>([]);
  selectedIds = signal<Set<number>>(new Set());
  note        = signal('');
  applying    = signal(false);
  applyError  = signal<string | null>(null);
  applied     = signal(false);
  unavailable = signal(false);
  now = signal(Date.now());
  private clock?: ReturnType<typeof setTimeout>;
  readonly statusClass = castingCallStatusClass;
  readonly displayStatus = castingDisplayStatus;
  isOpen = computed(() => {
    const call = this.call();
    return !!call && !this.unavailable() && castingIsOpen(call, this.now());
  });

  approvedVideos = computed(() => this.myVideos().filter(v => v.status === 'approved'));

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.marketplace.getCastingCall(id).subscribe({
      next: (c) => { this.call.set(c); this.loading.set(false); this.scheduleDeadline(c); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err.status === 404 ? 'marketplace.casting.notFound' : (apiErrorMessage(err) ?? 'marketplace.errors.loadFailed'));
      },
    });
    this.marketplace.getMyVideos().subscribe({
      next: (list) => this.myVideos.set(list),
      error: () => this.myVideos.set([]),
    });
  }

  toggleVideo(id: number): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  apply(): void {
    const c = this.call();
    this.now.set(Date.now());
    if (!c || this.applying() || this.applied() || !this.isOpen()) return;
    this.applying.set(true);
    this.applyError.set(null);
    this.marketplace.apply(c.id, {
      note: this.note().trim() || undefined,
      video_ids: [...this.selectedIds()],
    }).subscribe({
      next: () => { this.applying.set(false); this.applied.set(true); },
      error: (err: HttpErrorResponse) => {
        this.applying.set(false);
        if (err.status === 404) {
          this.unavailable.set(true);
          return;
        }
        if (err.status === 409) {
          this.applied.set(true);
          return;
        }
        this.applyError.set(apiErrorMessage(err) ?? 'marketplace.casting.applyFailed');
      },
    });
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
