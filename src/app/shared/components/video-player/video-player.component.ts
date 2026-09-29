import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef, HostListener,
  signal, computed, OnDestroy, OnChanges, SimpleChanges,
  PLATFORM_ID, inject, AfterViewInit,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';
import Hls from 'hls.js';
import { PlaybackProgress, PlaybackProgressReason, PlaybackSource, SubtitleTrack } from '../../models/movie-api.interface';

interface QualityLevel {
  index: number; // -1 = auto
  label: string;
  bitrate: number;
}

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss'],
})
export class VideoPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Plain URL (trailers, producer/admin previews). Ignored when `source` is set. */
  @Input() src = '';
  /** Entitled playback from /stream/ — takes precedence over `src`. */
  @Input() source: PlaybackSource | null = null;
  /**
   * Re-requests a fresh source when the signed URLs/token have expired (HTTP 403).
   * Called at most once per `source`/`src` handed in by the parent — never loops.
   */
  @Input() refreshSource: (() => Observable<PlaybackSource>) | null = null;
  @Input() poster = '';
  @Input() accentColor = '#c9a84c';
  @Input() startAt = 0;
  @Input() autoplay = false;
  @Input() showCloseButton = false;

  /** Every 15 s while playing, on pause/end/close, and when the page is hidden or unloaded. */
  @Output() progressUpdate = new EventEmitter<PlaybackProgress>();
  @Output() videoEnded     = new EventEmitter<void>();
  @Output() closed         = new EventEmitter<void>();

  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setInterval> | null = null;
  private hls: Hls | null = null;
  private viewReady = false;

  // Recovery state for the current parent-provided source
  private active: PlaybackSource | null = null;
  private refreshUsed = false;
  private fallbackUsed = false;
  private refreshSub: Subscription | null = null;
  private resumeAt = 0;

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
  tracks      = signal<SubtitleTrack[]>([]);

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
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    this.loadFromInputs();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.viewReady) return;
    const srcChanged    = changes['src']    && !changes['src'].firstChange;
    const sourceChanged = changes['source'] && !changes['source'].firstChange;
    if (srcChanged || sourceChanged) this.loadFromInputs();
  }

  ngOnDestroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.stopProgressTimer();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('pagehide', this.onPageHide);
      this.emitProgress('close'); // before teardown resets currentTime
    }
    this.destroyHls();
    this.refreshSub?.unsubscribe();
    this.active = null;
  }

  private readonly onPageHide = () => this.emitProgress('unload');
  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.emitProgress('unload');
  };

  private emitProgress(reason: PlaybackProgressReason): void {
    if (!this.active || !this.videoRef?.nativeElement) return;
    const v = this.videoRef.nativeElement;
    this.progressUpdate.emit({ position: v.currentTime, duration: v.duration, reason });
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKey(e: KeyboardEvent) {
    if (!this.viewReady) return;
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
  }

  // ── Source attachment ─────────────────────────────────

  /** A new source from the parent resets the one-shot refresh/fallback budget. */
  private loadFromInputs(): void {
    this.refreshSub?.unsubscribe();
    this.refreshUsed  = false;
    this.fallbackUsed = false;
    this.resumeAt     = 0;
    const source = this.source ?? (this.src
      ? { src: this.src, type: this.isHlsUrl(this.src) ? 'hls' : 'mp4', fallbackSrc: null, subtitles: [] } as PlaybackSource
      : null);
    this.attachSource(source);
  }

  private attachSource(source: PlaybackSource | null, useFallback = false): void {
    if (!isPlatformBrowser(this.platformId) || !this.videoRef?.nativeElement) return;

    this.resetPlayerState();
    this.active = source;
    this.tracks.set((source?.subtitles ?? []).filter(t => !!t.url));
    if (!source) return;

    const v   = this.video;
    const src = useFallback && source.fallbackSrc ? source.fallbackSrc : source.src;
    const isHls = !useFallback && source.type === 'hls';

    if (isHls) {
      if (Hls.isSupported()) {
        // No xhrSetup/credentials: the playlist proxy authorizes via its `token`
        // query param and segments are cross-origin presigned URLs.
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
          if (this.autoplay) v.play().catch(() => {});
        });

        this.hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          const expired = data.type === Hls.ErrorTypes.NETWORK_ERROR && data.response?.code === 403;
          this.recover(expired);
        });

      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS — the tokenised URL works unchanged
        v.src = src;
        if (this.autoplay) v.play().catch(() => {});
      } else if (source.fallbackSrc) {
        this.attachSource(source, true);
      } else {
        this.srcError.set(true);
      }
    } else {
      v.src = src;
      if (this.autoplay) {
        v.addEventListener('canplay', () => v.play().catch(() => {}), { once: true });
      }
    }
  }

  /**
   * Fatal playback error. A 403 (or any native-element error, where the status
   * isn't visible) means the signed URL/token may have expired: re-request the
   * source once and resume. Otherwise fall back to the MP4 once. Then give up.
   */
  private recover(maybeExpired: boolean): void {
    const source = this.active;
    if (!source) { this.fail(); return; }
    const at = this.video?.currentTime || this.resumeAt;

    if (maybeExpired && this.refreshSource && !this.refreshUsed) {
      this.refreshUsed = true;
      this.destroyHls();
      this.refreshSub = this.refreshSource().subscribe({
        next: fresh => { this.resumeAt = at; this.attachSource(fresh); },
        error: () => this.fail(),
      });
      return;
    }
    if (source.type === 'hls' && source.fallbackSrc && !this.fallbackUsed) {
      this.fallbackUsed = true;
      this.resumeAt = at;
      this.attachSource(source, true);
      return;
    }
    this.fail();
  }

  private fail(): void {
    this.destroyHls();
    this.srcError.set(true);
    this.playing.set(false);
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
      const seekTo = this.resumeAt > 0 ? this.resumeAt : this.startAt;
      if (seekTo > 0) v.currentTime = seekTo;
      this.resumeAt = 0;
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
      this.emitProgress('pause');
    });
    v.addEventListener('ended', () => {
      this.playing.set(false);
      this.stopProgressTimer();
      this.emitProgress('ended');
      this.videoEnded.emit();
    });
    v.addEventListener('error', () => {
      // hls.js handles its own errors; ignore the error from clearing `src` on reset
      if (this.hls || !this.active || !v.getAttribute('src')) return;
      this.recover(true);
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

  close() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    this.closed.emit();
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
    this.progressTimer = setInterval(() => this.emitProgress('interval'), 15_000);
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
