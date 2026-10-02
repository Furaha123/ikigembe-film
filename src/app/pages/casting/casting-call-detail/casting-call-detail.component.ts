import { Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../../actor/actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile, ActorVideo, CastingCall } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { ageFromDateOfBirth } from '../../../shared/utils/age';

/** Apply flow: choose videos + note → review (details come from the actor profile) → sent. */
export type ApplyStep = 'form' | 'review' | 'done';

@Component({
  selector: 'app-casting-call-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent],
  templateUrl: './casting-call-detail.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class CastingCallDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly injector = inject(Injector);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('applyHeading');

  call        = signal<CastingCall | null>(null);
  loading     = signal(true);
  loadError   = signal<string | null>(null);
  /** undefined while loading, null when the viewer has no actor profile. */
  profile     = signal<ActorProfile | null | undefined>(undefined);
  profileError = signal<string | null>(null);
  myVideos    = signal<ActorVideo[]>([]);
  selectedIds = signal<Set<number>>(new Set());
  note        = signal('');
  step        = signal<ApplyStep>('form');
  applying    = signal(false);
  applyError  = signal<string | null>(null);

  approvedVideos = computed(() => this.myVideos().filter(v => v.status === 'approved'));
  selectedVideos = computed(() => this.approvedVideos().filter(v => this.selectedIds().has(v.id)));
  age = computed(() => ageFromDateOfBirth(this.profile()?.date_of_birth));

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.marketplace.getCastingCall(id).subscribe({
      next: (c) => { this.call.set(c); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err.status === 404 ? 'marketplace.casting.notFound' : (apiErrorMessage(err) ?? 'marketplace.errors.loadFailed'));
      },
    });
    this.marketplace.getProfile().subscribe({
      next: (p) => this.profile.set(p),
      error: (err: HttpErrorResponse) => {
        if (err.status === 404) this.profile.set(null);
        else this.profileError.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
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

  goTo(step: ApplyStep): void {
    this.applyError.set(null);
    this.step.set(step);
    afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
  }

  submit(): void {
    const c = this.call();
    if (!c || this.applying()) return;
    this.applying.set(true);
    this.applyError.set(null);
    this.marketplace.apply(c.id, {
      note: this.note().trim() || undefined,
      video_ids: [...this.selectedIds()],
    }).subscribe({
      next: () => { this.applying.set(false); this.goTo('done'); },
      error: (err: HttpErrorResponse) => {
        this.applying.set(false);
        this.applyError.set(apiErrorMessage(err) ?? 'marketplace.casting.applyFailed');
      },
    });
  }
}
