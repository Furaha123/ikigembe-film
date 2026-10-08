import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DataSaverService } from '../../services/data-saver.service';

@Component({
  selector: 'app-banner',
  imports: [TranslatePipe],
  templateUrl: './banner.component.html',
  styleUrl: './banner.component.scss'
})
export class BannerComponent {
  private router    = inject(Router);
  private dataSaver = inject(DataSaverService);

  // ── Existing inputs (unchanged) ─────────────────────
  bannerTitle       = input<string>('');
  bannerOverview    = input<string>('');
  trailerUrl        = input<string>('');
  bannerBackdropUrl = input<string>('');
  movieId           = input<number | null>(null);

  // ── New metadata inputs ─────────────────────────────
  releaseDate     = input<string>('');
  durationMinutes = input<number>(0);
  movieRating     = input<number>(0);

  // ── Computed ────────────────────────────────────────
  isMuted  = signal(true);
  hasVideo = computed(() => !!this.trailerUrl() && !this.dataSaver.isActive());

  releaseYear = computed(() => this.releaseDate()?.substring(0, 4) ?? '');

  durationText = computed(() => {
    const m = this.durationMinutes();
    if (!m || m <= 0) return '';
    const h   = Math.floor(m / 60);
    const min = m % 60;
    if (h && min) return `${h}h ${min}m`;
    if (h)        return `${h}h`;
    return `${min}m`;
  });

  // ── Handlers (unchanged) ────────────────────────────
  toggleMute(): void { this.isMuted.update(v => !v); }

  play(): void {
    const id = this.movieId();
    if (id != null) this.router.navigate(['/movie', id]);
  }

  moreInfo(): void {
    const id = this.movieId();
    if (id != null) this.router.navigate(['/movie', id]);
  }
}
