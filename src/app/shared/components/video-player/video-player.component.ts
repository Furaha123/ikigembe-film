import {
  Component, Input, Output, EventEmitter,
  ViewChild, ElementRef,
  signal, computed, OnDestroy, OnChanges, SimpleChanges,
  PLATFORM_ID, inject, AfterViewInit,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription } from 'rxjs';
import Hls from 'hls.js';
import { PlaybackProgress, PlaybackProgressReason, PlaybackSource, SubtitleTrack } from '../../models/movie-api.interface';

const WATERMARK_MOVE_MS = 30_000;

/** Translation key for the adaptive quality option; level labels (e.g. 1080p) pass through the pipe unchanged. */
const AUTO_QUALITY_LABEL = 'playerUi.auto';

/** Why playback stopped: decides the message (network vs expired/denied vs the file itself). */
export type PlayerErrorKind = 'network' | 'denied' | 'media';

const VOLUME_STEP = 0.1;
const SEEK_STEP = 10;

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
  /** The viewer pressed Retry in the error state (the player reloads the source itself too). */
  @Output() retried        = new EventEmitter<void>();

  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('qualityBtn') qualityBtnRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('captionsBtn') captionsBtnRef?: ElementRef<HTMLButtonElement>;

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
  /** Where the session watermark sits (percent of the frame); moved every WATERMARK_MOVE_MS. */
  watermarkPos = signal({ top: 8, left: 6 });
  private watermarkTimer: ReturnType<typeof setInterval> | null = null;
  muted       = signal(false);
  volume      = signal(1);
  currentTime = signal(0);
  duration    = signal(0);
  fullscreen  = signal(false);
  showControls = signal(true);
  buffered    = signal(0);
  srcError    = signal(false);
  /** Set with srcError: which message the error state shows. */
  errorKind   = signal<PlayerErrorKind>('media');
  /** Spinner: from attaching a source until it can play, and while buffering (waiting/stalled). */
  loading     = signal(false);
  tracks      = signal<SubtitleTrack[]>([]);
  /** Index into tracks() of the caption shown, -1 = off. */
  activeTrack = signal(-1);
  showCaptionsMenu = signal(false);
  private lastTrack = 0;

  // HLS quality
  qualityLevels  = signal<QualityLevel[]>([]);
  currentQuality = signal(-1); // -1 = auto
  showQualityMenu = signal(false);

  progress = computed(() =>
    this.duration() > 0 ? (this.currentTime() / this.duration()) * 100 : 0
  );
  currentTimeStr = computed(() => this.formatTime(this.currentTime()));
  durationStr    = computed(() => this.formatTime(this.duration()));
  errorKey = computed(() => {
    switch (this.errorKind()) {
      case 'network': return 'playerUi.errors.network';
      case 'denied':  return 'playerUi.errors.denied';
      default:        return 'playerUi.errors.media';
    }
  });
  currentQualityLabel = computed(() => {
    const q = this.currentQuality();
    if (q === -1) return AUTO_QUALITY_LABEL;
    return this.qualityLevels().find(l => l.index === q)?.label ?? AUTO_QUALITY_LABEL;
  });

  get video(): HTMLVideoElement { return this.videoRef.nativeElement; }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.viewReady = true;
    this.attachVideoEvents();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
    this.watermarkTimer = setInterval(() => this.watermarkPos.set({
      top: 5 + Math.round(Math.random() * 80),
      left: 4 + Math.round(Math.random() * 72),
    }), WATERMARK_MOVE_MS);
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
    if (this.watermarkTimer) clearInterval(this.watermarkTimer);
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
    const tracks = (source?.subtitles ?? []).filter(t => !!t.url);
    this.tracks.set(tracks);
    const def = tracks.findIndex(t => t.is_default);
    this.activeTrack.set(def);
    this.lastTrack = Math.max(def, 0);
    if (!source) return;
    this.loading.set(true);

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
            { index: -1, label: AUTO_QUALITY_LABEL, bitrate: 0 },
            ...[...data.levels]
              .map((l, i) => ({
                index: i,
                label: this.levelLabel(l),
                bitrate: l.bitrate ?? 0,
              }))
              .reverse(),
          ];
          this.qualityLevels.set(levels);
          if (this.autoplay) this.startPlayback();
        });

        this.hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          const network = data.type === Hls.ErrorTypes.NETWORK_ERROR;
          // 403 from the proxy/key endpoint: token expired, device mismatch or a newer session took over.
          const expired = network && (data.response?.code === 403 || data.response?.code === 401);
          this.recover(expired, expired ? 'denied' : network ? 'network' : 'media');
        });

      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS — the tokenised URL works unchanged
        v.src = src;
        if (this.autoplay) this.startPlayback();
      } else if (source.fallbackSrc) {
        this.attachSource(source, true);
      } else {
        this.fail('media');
      }
    } else {
      v.src = src;
      if (this.autoplay) {
        v.addEventListener('canplay', () => this.startPlayback(), { once: true });
      }
    }
  }

  /**
   * Fatal playback error. A 403 (or any native-element error, where the status
   * isn't visible) means the signed URL/token may have expired: re-request the
   * source once and resume. Otherwise fall back to the MP4 once. Then give up.
   */
  private recover(maybeExpired: boolean, kind: PlayerErrorKind = maybeExpired ? 'denied' : 'media'): void {
    const source = this.active;
    if (!source) { this.fail(kind); return; }
    const at = this.video?.currentTime || this.resumeAt;

    if (maybeExpired && this.refreshSource && !this.refreshUsed) {
      this.refreshUsed = true;
      this.destroyHls();
      this.refreshSub = this.refreshSource().subscribe({
        next: fresh => { this.resumeAt = at; this.attachSource(fresh); },
        error: () => this.fail('denied'),
      });
      return;
    }
    if (source.type === 'hls' && source.fallbackSrc && !this.fallbackUsed) {
      this.fallbackUsed = true;
      this.resumeAt = at;
      this.attachSource(source, true);
      return;
    }
    this.fail(kind);
  }

  private fail(kind: PlayerErrorKind): void {
    this.destroyHls();
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.errorKind.set(offline ? 'network' : kind);
    this.srcError.set(true);
    this.loading.set(false);
    this.playing.set(false);
  }

  /**
   * Retry button in the error state: a fresh source from the parent when it can give one
   * (one /stream/ call per click), else the same source again. Resumes where playback stopped.
   */
  retry(): void {
    const at = this.video?.currentTime || this.resumeAt;
    this.retried.emit();
    this.refreshSub?.unsubscribe();
    this.fallbackUsed = false;
    if (this.refreshSource && this.source) {
      this.refreshUsed = true; // this click used the refresh; another 403 shows the error again
      this.srcError.set(false);
      this.loading.set(true);
      this.refreshSub = this.refreshSource().subscribe({
        next: fresh => { this.resumeAt = at; this.attachSource(fresh); },
        error: () => this.fail('denied'),
      });
      return;
    }
    this.refreshUsed = false;
    this.attachSource(this.active);
    this.resumeAt = at;
  }

  /** play(); a refused autoplay (NotAllowedError) or an interrupted play (AbortError) just leaves the play button. */
  private startPlayback(): void {
    const attempt = this.video.play();
    if (!attempt || typeof attempt.catch !== 'function') return;
    attempt.catch((err: unknown) => {
      const name = (err as { name?: string } | null)?.name;
      this.playing.set(false);
      if (name === 'NotAllowedError' || name === 'AbortError') {
        this.loading.set(false);
        return;
      }
      this.fail('media');
    });
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
    this.loading.set(false);
    this.qualityLevels.set([]);
    this.currentQuality.set(-1);
    this.showQualityMenu.set(false);
    this.showCaptionsMenu.set(false);
    this.stopProgressTimer();
    if (this.videoRef?.nativeElement) {
      this.video.removeAttribute('src');
      this.video.load();
    }
  }

  // ── Quality picker ────────────────────────────────────

  setQuality(index: number): void {
    this.currentQuality.set(index);
    this.closeMenus(true);
    if (this.hls) {
      this.hls.currentLevel = index;
    }
  }

  toggleQualityMenu(): void {
    const open = !this.showQualityMenu();
    this.showCaptionsMenu.set(false);
    this.showQualityMenu.set(open);
    if (open) this.focusMenu('.vp-quality-menu');
  }

  // ── Captions ──────────────────────────────────────────

  toggleCaptionsMenu(): void {
    const open = !this.showCaptionsMenu();
    this.showQualityMenu.set(false);
    this.showCaptionsMenu.set(open);
    if (open) this.focusMenu('.vp-captions-menu');
  }

  /** Show track `index` (-1 = off) by switching the <track> modes. */
  setCaption(index: number, closeMenu = true): void {
    this.activeTrack.set(index);
    if (index >= 0) this.lastTrack = index;
    this.applyTrackModes();
    if (closeMenu) this.closeMenus(true);
  }

  /** The C key: off <-> the last caption used (or the default one). */
  toggleCaptions(): void {
    if (!this.tracks().length) return;
    this.setCaption(this.activeTrack() >= 0 ? -1 : Math.min(this.lastTrack, this.tracks().length - 1), false);
  }

  private applyTrackModes(): void {
    const list = this.videoRef?.nativeElement?.textTracks;
    if (!list) return;
    const active = this.activeTrack();
    for (let i = 0; i < list.length; i++) {
      list[i].mode = i === active ? 'showing' : 'disabled';
    }
  }

  // ── Menus ─────────────────────────────────────────────

  get menuOpen(): boolean { return this.showQualityMenu() || this.showCaptionsMenu(); }

  /** Close any open menu; `returnFocus` puts focus back on the button that opened it. */
  closeMenus(returnFocus = false): void {
    const btn = this.showQualityMenu() ? this.qualityBtnRef : this.showCaptionsMenu() ? this.captionsBtnRef : undefined;
    this.showQualityMenu.set(false);
    this.showCaptionsMenu.set(false);
    if (returnFocus) btn?.nativeElement.focus();
  }

  /** Focus the checked item of a menu once it has rendered. */
  private focusMenu(selector: string): void {
    setTimeout(() => {
      const menu = this.videoRef?.nativeElement?.closest('.vp-wrapper')?.querySelector(selector);
      const item = menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLElement>('button');
      item?.focus();
    });
  }

  /** Arrow keys move between a menu's items. */
  private moveMenuFocus(menu: Element, delta: number): void {
    const items = Array.from(menu.querySelectorAll<HTMLElement>('button'));
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + delta + items.length) % items.length].focus();
  }

  // ── Video event wiring ────────────────────────────────

  private attachVideoEvents(): void {
    const v = this.video;

    v.addEventListener('loadedmetadata', () => {
      this.duration.set(v.duration);
      this.applyTrackModes();
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
    for (const evt of ['waiting', 'stalled']) {
      v.addEventListener(evt, () => { if (this.active && !this.srcError()) this.loading.set(true); });
    }
    for (const evt of ['canplay', 'playing', 'loadeddata']) {
      v.addEventListener(evt, () => this.loading.set(false));
    }
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
      // The element hides the HTTP status: an expired URL can surface as any code, so the refresh is tried first.
      const code = v.error?.code;
      this.recover(true, code === 2 /* MEDIA_ERR_NETWORK */ ? 'network' : code === 3 /* DECODE */ ? 'media' : 'denied');
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
    if (this.srcError()) return;
    if (this.video.paused) {
      this.startPlayback();
    } else {
      this.video.pause();
    }
  }

  rewind()   { this.video.currentTime = Math.max(0, this.video.currentTime - SEEK_STEP); }
  forward()  {
    const end = Number.isFinite(this.video.duration) ? this.video.duration : this.video.currentTime + SEEK_STEP;
    this.video.currentTime = Math.min(end, this.video.currentTime + SEEK_STEP);
  }

  private nudgeVolume(delta: number) {
    const val = Math.round(Math.min(1, Math.max(0, this.video.volume + delta)) * 100) / 100;
    this.video.volume = val;
    this.video.muted = val === 0;
    this.volume.set(val);
  }
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
      document.exitFullscreen().catch(() => { /* already left fullscreen */ });
    }
    this.closed.emit();
  }

  onMouseMove() {
    this.showControls.set(true);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      if (this.playing()) {
        this.showControls.set(false);
        this.closeMenus();
      }
    }, 3000);
  }

  onMouseLeave() {
    if (this.playing()) {
      this.showControls.set(false);
      this.closeMenus();
    }
  }

  /**
   * Shortcuts while the player has focus: space/k play-pause, left/right seek 10 s, up/down volume,
   * m mute, f fullscreen, c captions. Escape closes an open menu with preventDefault(), so a
   * surrounding dialog stays open; with no menu open Escape is left to the dialog.
   */
  onKeyDown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const menu = target?.closest?.('.vp-menu');
    if (e.key === 'Escape') {
      if (this.menuOpen) { e.preventDefault(); this.closeMenus(true); }
      return;
    }
    if (menu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.moveMenuFocus(menu, 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.moveMenuFocus(menu, -1); }
      return; // Enter/Space activate the focused item natively
    }
    const tag = target?.tagName;
    // Buttons and sliders handle their own Space/Enter/arrow keys.
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    if (tag === 'INPUT' && e.key.startsWith('Arrow')) return;
    if (this.srcError()) return;

    switch (e.key) {
      case ' ': case 'k': case 'K': e.preventDefault(); this.togglePlay(); break;
      case 'ArrowLeft':  e.preventDefault(); this.rewind(); break;
      case 'ArrowRight': e.preventDefault(); this.forward(); break;
      case 'ArrowUp':    e.preventDefault(); this.nudgeVolume(VOLUME_STEP); break;
      case 'ArrowDown':  e.preventDefault(); this.nudgeVolume(-VOLUME_STEP); break;
      case 'm': case 'M': this.toggleMute(); break;
      case 'f': case 'F': this.toggleFullscreen(); break;
      case 'c': case 'C': this.toggleCaptions(); break;
    }
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
