import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef, HostListener,
  signal, computed, OnDestroy, OnChanges, SimpleChanges,
  PLATFORM_ID, inject, AfterViewInit,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import Hls from 'hls.js';

interface QualityLevel {
  index: number; // -1 = auto
  label: string;
  bitrate: number;
}

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss'],
})
export class VideoPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() src = '';
  @Input() poster = '';
  @Input() accentColor = '#c9a84c';
  @Input() startAt = 0;

  @Output() progressUpdate = new EventEmitter<number>();
  @Output() videoEnded     = new EventEmitter<void>();

  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private hls: Hls | null = null;
  private viewReady = false;

  // Playback state
  playing     = signal(false);
  muted       = signal(false);
  volume      = signal(1);
  currentTime = signal(0);
  duration    = signal(0);
  fullscreen  = signal(false);
  showControls = signal(true);
  buffered    = signal(0);
  srcError    = signal(false);

  // HLS quality
  qualityLevels  = signal<QualityLevel[]>([]);
  currentQuality = signal(-1); // -1 = auto
  showQualityMenu = signal(false);

  progress = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0
  );
  currentTimeStr = computed(() => this.formatTime(this.currentTime()));
  durationStr    = computed(() => this.formatTime(this.duration()));
  currentQualityLabel = computed(() => {
    const q = this.currentQuality();
    if (q === -1) return 'Auto';
    return this.qualityLevels().find(l => l.index === q)?.label ?? 'Auto';
  });

  get video(): HTMLVideoElement { return this.videoRef.nativeElement; }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.viewReady = true;
    this.attachVideoEvents();
    if (this.src) this.attachSource(this.src);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['src'] && !changes['src'].firstChange && this.viewReady) {
      this.attachSource(changes['src'].currentValue ?? '');
    }
  }

  ngOnDestroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.stopProgressTimer();
    this.destroyHls();
    if (isPlatformBrowser(this.platformId) && this.videoRef?.nativeElement) {
      this.progressUpdate.emit(this.videoRef.nativeElement.currentTime);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKey(e: KeyboardEvent) {
    if (!this.viewReady) return;
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
  }

  // ── Source attachment ─────────────────────────────────

  private attachSource(src: string): void {
    if (!isPlatformBrowser(this.platformId) || !this.videoRef?.nativeElement) return;

    this.resetPlayerState();
    if (!src) return;

    const v = this.video;

    if (this.isHlsUrl(src)) {
      if (Hls.isSupported()) {
        this.hls = new Hls({ startLevel: -1, debug: false });
        this.hls.loadSource(src);
        this.hls.attachMedia(v);

        this.hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          const levels: QualityLevel[] = [
            { index: -1, label: 'Auto', bitrate: 0 },
            ...[...data.levels]
              .map((l: any, i: number) => ({
                index: i,
                label: this.levelLabel(l),
                bitrate: l.bitrate ?? 0,
              }))
              .reverse(),
          ];
          this.qualityLevels.set(levels);
        });

        this.hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) this.srcError.set(true);
        });

      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        v.src = src;
      } else {
        this.srcError.set(true);
      }
    } else {
      v.src = src;
    }
  }

  private destroyHls(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  private isHlsUrl(url: string): boolean {
    return url.includes('.m3u8');
  }

  private levelLabel(l: { height?: number; bitrate?: number }): string {
    const h = l.height ?? 0;
    if (h >= 1080) return '1080p';
    if (h >= 720)  return '720p';
    if (h >= 480)  return '480p';
    if (h >= 360)  return '360p';
    if (h >= 240)  return '240p';
    if (h > 0)     return `${h}p`;
    const kbps = Math.round((l.bitrate ?? 0) / 1000);
    return kbps > 0 ? `${kbps}k` : 'Unknown';
  }

  private resetPlayerState(): void {
    this.destroyHls();
    this.playing.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
    this.buffered.set(0);
    this.srcError.set(false);
    this.qualityLevels.set([]);
    this.currentQuality.set(-1);
    this.showQualityMenu.set(false);
    this.stopProgressTimer();
    if (this.videoRef?.nativeElement) {
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  // ── Quality picker ────────────────────────────────────

  setQuality(index: number): void {
    this.currentQuality.set(index);
    this.showQualityMenu.set(false);
    if (this.hls) {
      this.hls.currentLevel = index;
    }
  }

  toggleQualityMenu(): void {
    this.showQualityMenu.update(v => !v);
  }

  // ── Video event wiring ────────────────────────────────

  private attachVideoEvents(): void {
    const v = this.video;

    v.addEventListener('loadedmetadata', () => {
      this.duration.set(v.duration);
      if (this.startAt > 0) v.currentTime = this.startAt;
    });

    v.addEventListener('timeupdate', () => {
      this.currentTime.set(v.currentTime);
      if (v.buffered.length) {
        this.buffered.set((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
      }
    });

    v.addEventListener('play',  () => { this.playing.set(true);  this.startProgressTimer(); });
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
      if (!this.hls) { // hls.js handles its own errors
        this.srcError.set(true);
        this.playing.set(false);
      }
    });
    v.addEventListener('volumechange', () => {
      this.muted.set(v.muted);
      this.volume.set(v.volume);
    });

    document.addEventListener('fullscreenchange', () =>
      this.fullscreen.set(!!document.fullscreenElement)
    );
  }

  // ── Playback controls ─────────────────────────────────

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

  rewind()   { this.video.currentTime = Math.max(0, this.video.currentTime - 10); }
  forward()  { this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + 10); }
  toggleMute() { this.video.muted = !this.video.muted; }

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
      if (this.playing()) {
        this.showControls.set(false);
        this.showQualityMenu.set(false);
      }
    }, 3000);
  }

  onMouseLeave() {
    if (this.playing()) {
      this.showControls.set(false);
      this.showQualityMenu.set(false);
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.code === 'Space')      { e.preventDefault(); this.togglePlay(); }
    else if (e.code === 'ArrowLeft')  { e.preventDefault(); this.rewind(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); this.forward(); }
    else if (e.code === 'KeyM')       { this.toggleMute(); }
    else if (e.code === 'KeyF')       { this.toggleFullscreen(); }
  }

  onProgressKeyDown(e: KeyboardEvent) {
    const step = this.duration() * 0.02;
    if (e.code === 'ArrowLeft')       { e.preventDefault(); this.video.currentTime = Math.max(0, this.video.currentTime - step); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); this.video.currentTime = Math.min(this.video.duration, this.video.currentTime + step); }
  }

  // ── Progress timer ────────────────────────────────────

  private startProgressTimer() {
    this.stopProgressTimer();
    this.progressTimer = setInterval(() => this.progressUpdate.emit(this.video.currentTime), 15_000);
  }

  private stopProgressTimer() {
    if (this.progressTimer) { clearInterval(this.progressTimer); this.progressTimer = null; }
  }

  private formatTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const m   = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}
