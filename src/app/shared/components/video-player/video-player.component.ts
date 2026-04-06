import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef,
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
  @Input() startAt = 0; // seconds to seek to on load

  @Output() progressUpdate = new EventEmitter<number>(); // emits currentTime every 15s
  @Output() videoEnded     = new EventEmitter<void>();

  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;

  // State
  playing     = signal(false);
  muted       = signal(false);
  volume      = signal(1);
  currentTime = signal(0);
  duration    = signal(0);
  fullscreen  = signal(false);
  showControls = signal(true);
  buffered    = signal(0);
  srcError    = signal(false);

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

    v.addEventListener('loadedmetadata', () => {
      this.duration.set(v.duration);
      if (this.startAt > 0) {
        v.currentTime = this.startAt;
      }
    });

    v.addEventListener('timeupdate', () => {
      this.currentTime.set(v.currentTime);
      if (v.buffered.length) {
        this.buffered.set((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
      }
    });

    v.addEventListener('play',  () => {
      this.playing.set(true);
      this.startProgressTimer();
    });

    v.addEventListener('pause', () => {
      this.playing.set(false);
      this.stopProgressTimer();
      this.progressUpdate.emit(v.currentTime);
    });

    v.addEventListener('ended', () => {
      this.playing.set(false);
      this.stopProgressTimer();
      this.videoEnded.emit();
    });

    v.addEventListener('error', () => {
      this.srcError.set(true);
      this.playing.set(false);
    });

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
    this.stopProgressTimer();
    // Emit final position before destroy
    if (isPlatformBrowser(this.platformId) && this.videoRef?.nativeElement) {
      this.progressUpdate.emit(this.videoRef.nativeElement.currentTime);
    }
  }

  private startProgressTimer() {
    this.stopProgressTimer();
    this.progressTimer = setInterval(() => {
      this.progressUpdate.emit(this.video.currentTime);
    }, 15000); // save every 15 seconds
  }

  private stopProgressTimer() {
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
  }

  togglePlay() {
    if (this.video.paused) {
      this.video.play().catch(() => {
        this.srcError.set(true);
        this.playing.set(false);
      });
    } else {
      this.video.pause();
    }
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

  onSeekInput(e: Event) {
    this.video.currentTime = +(e.target as HTMLInputElement).value;
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

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space') { e.preventDefault(); this.togglePlay(); }
    else if (e.code === 'ArrowLeft')  { e.preventDefault(); this.rewind(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); this.forward(); }
    else if (e.code === 'KeyM')       { this.toggleMute(); }
    else if (e.code === 'KeyF')       { this.toggleFullscreen(); }
  }

  onProgressKeyDown(e: KeyboardEvent) {
    const step = this.duration() * 0.02; // 2% per keypress
    if (e.code === 'ArrowLeft')  { e.preventDefault(); this.video.currentTime = Math.max(0, this.video.currentTime - step); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + step); }
  }

  private formatTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
