import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../../services/casting.service';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
import { CastingApplication, CastingCall, DirectoryVideo } from '../../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../../shared/utils/marketplace-error';

import { ModalBackdropDirective } from '../../../../shared/directives/modal-backdrop.directive';
/**
 * Applicants to one of my casting calls: a plain list (who applied, when, their note and audition
 * videos) — producers don't manage application statuses here. Two entries: /producer/casting/:id
 * (that call) and /producer/applications (pick a call; `?call=<id>`).
 */
@Component({
  selector: 'app-casting-applications',
  standalone: true,
  imports: [ModalBackdropDirective, CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent],
  templateUrl: './casting-applications.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss', './casting-applications.component.scss'],
})
export class CastingApplicationsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly casting = inject(CastingService);

  /** Picker mode (/producer/applications) versus one fixed call. */
  pickerMode   = false;
  calls        = signal<CastingCall[]>([]);
  callId       = signal<number | null>(null);
  call         = computed(() => this.calls().find(c => c.id === this.callId()) ?? null);
  /** Calls that can have applicants (published at some point). */
  pickable     = computed(() => this.calls().filter(c => c.status === 'published' || c.status === 'closed'));

  applications = signal<CastingApplication[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);
  /** Video being previewed; its signed URL is dropped when the preview closes. */
  preview      = signal<DirectoryVideo | null>(null);

  ngOnInit(): void {
    const fixed = Number(this.route.snapshot.paramMap.get('id'));
    this.pickerMode = !fixed;
    this.casting.getMyCalls().subscribe({
      next: (list) => {
        this.calls.set(list);
        if (this.pickerMode) {
          const wanted = Number(this.route.snapshot.queryParamMap.get('call'));
          const first = this.pickable().find(c => c.id === wanted) ?? this.pickable()[0];
          if (first) this.select(first.id);
          else this.loading.set(false);
        }
      },
      error: (err: unknown) => {
        if (this.pickerMode) {
          this.loading.set(false);
          this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
        } // fixed mode: the title is optional
      },
    });
    if (fixed) this.loadApplications(fixed);
  }

  /** Avatar letters from the stage name ("Grace Akimana" → "GA"); "?" for an unnamed actor. */
  initials(name: string | null): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
    return letters.toUpperCase();
  }

  onPick(event: Event): void {
    this.select(Number((event.target as HTMLSelectElement).value));
  }

  private select(id: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { call: id }, replaceUrl: true });
    this.loadApplications(id);
  }

  loadApplications(id = this.callId()): void {
    if (!id) return;
    this.callId.set(id);
    this.loading.set(true);
    this.error.set(null);
    this.applications.set([]);
    this.casting.getApplications(id).subscribe({
      next: (list) => { this.applications.set(list); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

}
