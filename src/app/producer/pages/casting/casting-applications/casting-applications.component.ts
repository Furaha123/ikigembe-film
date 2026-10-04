import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../../services/casting.service';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
import { ApplicationStatus, CastingApplication, CastingCall, DirectoryVideo } from '../../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../../shared/utils/marketplace-error';
import { applicationStatusClass } from '../../../../shared/utils/marketplace-status';

export type ApplicationFilter = 'all' | ApplicationStatus;

/**
 * Applicants to one of my casting calls. Two entries: /producer/casting/:id
 * (that call) and /producer/applications (pick a call; `?call=<id>`).
 * Status changes are saved through the API before they show.
 */
@Component({
  selector: 'app-casting-applications',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent],
  templateUrl: './casting-applications.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss'],
})
export class CastingApplicationsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly casting = inject(CastingService);

  readonly statuses: ApplicationStatus[] = ['submitted', 'shortlisted', 'declined'];
  readonly filters: ApplicationFilter[] = ['all', 'submitted', 'shortlisted', 'declined'];
  readonly statusClass = applicationStatusClass;

  /** Picker mode (/producer/applications) versus one fixed call. */
  pickerMode   = false;
  calls        = signal<CastingCall[]>([]);
  callId       = signal<number | null>(null);
  call         = computed(() => this.calls().find(c => c.id === this.callId()) ?? null);
  /** Calls that can have applicants (published at some point). */
  pickable     = computed(() => this.calls().filter(c => c.status === 'published' || c.status === 'closed'));

  applications = signal<CastingApplication[]>([]);
  filter       = signal<ApplicationFilter>('all');
  visible      = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.applications() : this.applications().filter(a => a.status === f);
  });
  loading      = signal(true);
  error        = signal<string | null>(null);
  updatingId   = signal<number | null>(null);
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

  count(f: ApplicationFilter): number {
    return f === 'all' ? this.applications().length : this.applications().filter(a => a.status === f).length;
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

  setStatus(app: CastingApplication, status: ApplicationStatus): void {
    if (status === app.status || this.updatingId()) return;
    this.updatingId.set(app.id);
    this.error.set(null);
    this.casting.setApplicationStatus(app.id, status).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.applications.update(list => list.map(a => a.id === updated.id ? updated : a));
      },
      error: (err: unknown) => {
        this.updatingId.set(null);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  onStatusChange(app: CastingApplication, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value as ApplicationStatus;
    // Show the saved value until the server confirms the change.
    select.value = app.status;
    this.setStatus(app, status);
  }
}
