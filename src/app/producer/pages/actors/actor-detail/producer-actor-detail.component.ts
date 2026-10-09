import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { CastingService } from '../../../services/casting.service';
import { VideoPlayerComponent } from '../../../../shared/components/video-player/video-player.component';
import { DirectoryActorDetail, DirectoryVideo } from '../../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../../shared/utils/marketplace-error';
import { ReportButtonComponent } from '../../../../shared/components/report-button/report-button.component';

@Component({
  selector: 'app-producer-actor-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, VideoPlayerComponent, ReportButtonComponent],
  templateUrl: './producer-actor-detail.component.html',
  styleUrls: ['../../../../shared/styles/marketplace-page.scss', './producer-actor-detail.component.scss'],
})
export class ProducerActorDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly casting = inject(CastingService);

  actor       = signal<DirectoryActorDetail | null>(null);
  loading     = signal(true);
  /** Translation key or backend message. */
  error       = signal<string | null>(null);
  /** No (or an expired) directory pass. */
  noAccess    = signal(false);
  shortlisted = signal(false);
  busy        = signal(false);
  preview     = signal<DirectoryVideo | null>(null);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.casting.getActor(id).subscribe({
      next: (a) => { this.actor.set(a); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status === 403) this.noAccess.set(true);
        else this.error.set(err.status === 404 ? 'marketplace.directory.actorNotFound' : (marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed'));
      },
    });
    this.casting.getShortlist().subscribe({
      next: (list) => this.shortlisted.set(list.some(e => e.actor.id === id)),
      error: () => { /* reflected by the actor request */ },
    });
  }

  toggleShortlist(): void {
    const a = this.actor();
    if (!a || this.busy()) return;
    this.busy.set(true);
    const req: Observable<unknown> = this.shortlisted() ? this.casting.removeFromShortlist(a.id) : this.casting.addToShortlist(a.id);
    req.subscribe({
      next: () => { this.busy.set(false); this.shortlisted.update(v => !v); },
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        if (err.status === 409) { this.shortlisted.set(true); return; }
        if (err.status === 403) { this.noAccess.set(true); this.actor.set(null); return; }
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.actionFailed');
      },
    });
  }
}
