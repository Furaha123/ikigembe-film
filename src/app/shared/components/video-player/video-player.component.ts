import {
  Component, Input, ViewChild, ElementRef,
  signal, computed, OnDestroy, PLATFORM_ID, inject, AfterViewInit
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss']
})
export class VideoPlayerComponent implements AfterViewInit, OnDestroy {
  @Input() src = '';
  @Input() poster = '';
  @Input() accentColor = '#c9a84c';

  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('progressEl') progressRef!: ElementRef<HTMLInputElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // State
  playing    = signal(false);
  muted      = signal(false);
  volume     = signal(1);
  currentTime = signal(0);
  duration    = signal(0);
  fullscreen  = signal(false);
  showControls = signal(true);
  buffered   = signal(0);

  progress = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0
  );

  currentTimeStr = computed(() => this.formatTime(this.currentTime()));
  durationStr    = computed(() => this.formatTime(this.duration()));

  get video(): HTMLVideoElement {
    return this.videoRef.nativeElement;
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const v = this.video;
    v.addEventListener('timeupdate',  () => {
      this.currentTime.set(v.currentTime);
      if (v.buffered.length) {
        this.buffered.set((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
      }
    });
    v.addEventListener('loadedmetadata', () => this.duration.set(v.duration));
    v.addEventListener('play',   () => this.playing.set(true));
    v.addEventListener('pause',  () => this.playing.set(false));
    v.addEventListener('ended',  () => this.playing.set(false));
    v.addEventListener('volumechange', () => {
      this.muted.set(v.muted);
      this.volume.set(v.volume);
    });

    document.addEventListener('fullscreenchange', () =>
      this.fullscreen.set(!!document.fullscreenElement)
    );
  }

  ngOnDestroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
  }

  togglePlay() {
    this.video.paused ? this.video.play() : this.video.pause();
  }

  rewind() {
    this.video.currentTime = Math.max(0, this.video.currentTime - 10);
  }

  forward() {
    this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10);
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
  }

  onVolumeChange(e: Event) {
    const val = +(e.target as HTMLInputElement).value;
    this.video.volume = val;
    this.video.muted  = val === 0;
    this.volume.set(val);
  }

  seek(e: MouseEvent) {
    const bar   = e.currentTarget as HTMLElement;
    const rect  = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    this.video.currentTime = ratio * this.video.duration;
  }

  toggleFullscreen() {
    const el = this.videoRef.nativeElement.closest('.vp-wrapper') as HTMLElement;
    if (!document.fullscreenElement) {
      el?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  onMouseMove() {
    this.showControls.set(true);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.playing()) this.showControls.set(false);
    }, 3000);
  }

  onMouseLeave() {
    if (this.playing()) this.showControls.set(false);
  }

  private formatTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
