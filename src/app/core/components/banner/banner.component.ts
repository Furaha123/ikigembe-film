import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataSaverService } from '../../services/data-saver.service';

@Component({
  selector: 'app-banner',
  templateUrl: './banner.component.html',
  styleUrl: './banner.component.scss'
})
export class BannerComponent {
  private router    = inject(Router);
  private dataSaver = inject(DataSaverService);

  bannerTitle       = input<string>('');
  bannerOverview    = input<string>('');
  trailerUrl        = input<string>('');
  bannerBackdropUrl = input<string>('');
  movieId           = input<number | null>(null);

  isMuted = signal(true);

  hasVideo = computed(() => !!this.trailerUrl() && !this.dataSaver.isActive());

  toggleMute(): void {
    this.isMuted.update(v => !v);
  }

  play(): void {
    const id = this.movieId();
    if (id != null) this.router.navigate(['/movie', id]);
  }

  moreInfo(): void {
    const id = this.movieId();
    if (id != null) this.router.navigate(['/movie', id]);
  }
}
