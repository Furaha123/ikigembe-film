import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingService } from '../../../services/casting.service';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
import { ApplicationStatus, CastingApplication, CastingCall, DirectoryVideo } from '../../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../../shared/utils/api-error';
import { applicationStatusClass } from '../../../../shared/utils/marketplace-status';

@Component({
  selector: 'app-casting-applications',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent],
  templateUrl: './casting-applications.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss'],
})
export class CastingApplicationsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly casting = inject(CastingService);

  readonly statuses: ApplicationStatus[] = ['submitted', 'shortlisted', 'declined'];
  readonly statusClass = applicationStatusClass;

  call         = signal<CastingCall | null>(null);
  applications = signal<CastingApplication[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);
  updatingId   = signal<number | null>(null);
  /** Video being previewed; its signed URL is dropped when the preview closes. */
  preview      = signal<DirectoryVideo | null>(null);

  private callId = 0;

  ngOnInit(): void {
    this.callId = Number(this.route.snapshot.paramMap.get('id'));
    this.casting.getMyCalls().subscribe({
      next: (list) => this.call.set(list.find(c => c.id === this.callId) ?? null),
      error: () => { /* title is optional */ },
    });
    this.casting.getApplications(this.callId).subscribe({
      next: (list) => { this.applications.set(list); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  setStatus(app: CastingApplication, status: ApplicationStatus): void {
    if (status === app.status) return;
    this.updatingId.set(app.id);
    this.error.set(null);
    this.casting.setApplicationStatus(app.id, status).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.applications.update(list => list.map(a => a.id === updated.id ? updated : a));
      },
      error: (err: unknown) => {
        this.updatingId.set(null);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }

  onStatusChange(app: CastingApplication, event: Event): void {
    this.setStatus(app, (event.target as HTMLSelectElement).value as ApplicationStatus);
  }
}
