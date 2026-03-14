import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-banner',
  templateUrl: './banner.component.html',
  styleUrl: './banner.component.scss'
})
export class BannerComponent {
  private sanitizer = inject(DomSanitizer);

  bannerTitle = input<string>('');
  bannerOverview = input<string>('');
  trailerKey = input<string>('');
  bannerBackdropUrl = input<string>('');

  isMuted = signal(true);

  videoUrl = computed(() => {
    const key = this.trailerKey();
    if (!key) return null;
    const mute = this.isMuted() ? 1 : 0;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${key}?autoplay=1&mute=${mute}&loop=1&playlist=${key}&controls=0&showinfo=0&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`
    );
  });

  toggleMute() {
    this.isMuted.update(v => !v);
  }
}
