import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import Hls from 'hls.js';
import { PlaybackProgress, PlaybackSource } from '../../models/movie-api.interface';
import { VideoPlayerComponent } from './video-player.component';

type Handler = (event: string, data: unknown) => void;

describe('VideoPlayerComponent', () => {
  let fixture: ComponentFixture<VideoPlayerComponent>;
  let component: VideoPlayerComponent;
  let handlers: Record<string, Handler>;
  let loadSource: jasmine.Spy;

  const hlsSource: PlaybackSource = {
    src: 'https://api.test/api/movies/12/hls-proxy/master.m3u8?token=old',
    type: 'hls',
    fallbackSrc: 'https://r2.test/movie.mp4?sig=old',
    subtitles: [],
  };
  const fatal403 = {
    fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR, details: Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
    response: { code: 403, text: 'Forbidden' },
  };
  const fatalOther = {
    fatal: true, type: Hls.ErrorTypes.MEDIA_ERROR, details: Hls.ErrorDetails.BUFFER_APPEND_ERROR,
  };

  const video = () => fixture.nativeElement.querySelector('video') as HTMLVideoElement;
  const emitHlsError = (data: unknown) => handlers[Hls.Events.ERROR]('hlsError', data);
  const load = (source: PlaybackSource, refresh: VideoPlayerComponent['refreshSource'] = null) => {
    fixture.componentRef.setInput('source', source);
    fixture.componentRef.setInput('refreshSource', refresh);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    handlers = {};
    spyOn(Hls, 'isSupported').and.returnValue(true);
    loadSource = spyOn(Hls.prototype, 'loadSource');
    spyOn(Hls.prototype, 'attachMedia');
    spyOn(Hls.prototype, 'on').and.callFake(((event: string, cb: Handler) => { handlers[event] = cb; }) as never);

    await TestBed.configureTestingModule({
      imports: [VideoPlayerComponent],
      providers: [provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(VideoPlayerComponent);
    component = fixture.componentInstance;
  });

  it('plays an HLS stream through hls.js using stream_url unchanged', () => {
    load(hlsSource);
    expect(loadSource).toHaveBeenCalledOnceWith(hlsSource.src);
    expect(video().getAttribute('src')).toBeNull();
  });

  it('plays an MP4 stream directly on the video element (no hls.js)', () => {
    load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });
    expect(loadSource).not.toHaveBeenCalled();
    expect(video().getAttribute('src')).toBe('https://r2.test/film.mp4?sig');
  });

  it('draws the session watermark only when the stream response carries one', () => {
    load(hlsSource);
    expect(fixture.nativeElement.querySelector('.vp-watermark')).toBeNull();
    load({ ...hlsSource, watermark: 'IKG-7F3A2C91' });
    const mark = fixture.nativeElement.querySelector('.vp-watermark') as HTMLElement;
    expect(mark.textContent?.trim()).toBe('IKG-7F3A2C91');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
  });

  it('still supports a plain src (trailers, previews)', () => {
    fixture.componentRef.setInput('src', 'https://cdn.test/trailer.mp4');
    fixture.detectChanges();
    expect(video().getAttribute('src')).toBe('https://cdn.test/trailer.mp4');
  });

  it('re-requests the stream once on a fatal 403 and loads the fresh URL', () => {
    const fresh: PlaybackSource = { ...hlsSource, src: 'https://api.test/master.m3u8?token=new', fallbackSrc: null };
    const refresh = jasmine.createSpy('refresh').and.returnValue(of(fresh));
    load(hlsSource, refresh);

    emitHlsError(fatal403);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(loadSource.calls.mostRecent().args[0]).toBe(fresh.src);
    expect(component.srcError()).toBeFalse();
  });

  it('does not loop: a second 403 after the refresh shows the error state', () => {
    const fresh: PlaybackSource = { ...hlsSource, src: 'https://api.test/master.m3u8?token=new', fallbackSrc: null };
    const refresh = jasmine.createSpy('refresh').and.returnValue(of(fresh));
    load(hlsSource, refresh);

    emitHlsError(fatal403);
    emitHlsError(fatal403);
    fixture.detectChanges();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(component.srcError()).toBeTrue();
    expect(fixture.nativeElement.querySelector('.vp-error[role="alert"]')).not.toBeNull();
  });

  it('shows the error state when the refresh request itself fails', () => {
    const refresh = jasmine.createSpy('refresh').and.returnValue(throwError(() => new Error('403')));
    load(hlsSource, refresh);

    emitHlsError(fatal403);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(component.srcError()).toBeTrue();
  });

  it('falls back to the MP4 once on a non-auth fatal HLS error', () => {
    load(hlsSource);

    emitHlsError(fatalOther);

    expect(video().getAttribute('src')).toBe(hlsSource.fallbackSrc);
    expect(component.srcError()).toBeFalse();
  });

  it('without a refresher or fallback a fatal error shows the error state', () => {
    load({ ...hlsSource, fallbackSrc: null });
    emitHlsError(fatal403);
    expect(component.srcError()).toBeTrue();
  });

  it('renders a subtitle track per entitled subtitle and enables CORS for them', () => {
    load({
      ...hlsSource,
      subtitles: [
        { id: 1, language_code: 'en', language_name: 'English', url: 'https://r2.test/en.vtt?sig', is_default: true, ordering: 0 },
        { id: 2, language_code: 'rw', language_name: 'Kinyarwanda', url: null, is_default: false, ordering: 1 },
      ],
    });

    const tracks = fixture.nativeElement.querySelectorAll('track');
    expect(tracks.length).toBe(1);
    expect(tracks[0].getAttribute('srclang')).toBe('en');
    expect(video().getAttribute('crossorigin')).toBe('anonymous');
  });

  it('does not set crossorigin when there are no subtitles', () => {
    load(hlsSource);
    expect(video().getAttribute('crossorigin')).toBeNull();
  });

  describe('loading, errors and retry', () => {
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

    it('shows a spinner until the video can play, and again while buffering', () => {
      load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });
      expect(component.loading()).toBeTrue();
      expect(q('.vp-spinner')).not.toBeNull();
      expect(q('.vp-center-play')).toBeNull();

      video().dispatchEvent(new Event('canplay'));
      fixture.detectChanges();
      expect(q('.vp-spinner')).toBeNull();
      expect(q('.vp-center-play')).not.toBeNull();

      video().dispatchEvent(new Event('waiting'));
      fixture.detectChanges();
      expect(q('.vp-spinner')).not.toBeNull();
      video().dispatchEvent(new Event('playing'));
      fixture.detectChanges();
      expect(q('.vp-spinner')).toBeNull();
    });

    it('names the cause: expired/denied (403), network, or the file itself', () => {
      load({ ...hlsSource, fallbackSrc: null });
      emitHlsError(fatal403);
      expect(component.errorKind()).toBe('denied');
      expect(component.errorKey()).toBe('playerUi.errors.denied');

      load({ ...hlsSource, src: 'https://api.test/b.m3u8', fallbackSrc: null });
      emitHlsError({ fatal: true, type: Hls.ErrorTypes.NETWORK_ERROR, details: Hls.ErrorDetails.FRAG_LOAD_ERROR, response: { code: 0 } });
      expect(component.errorKind()).toBe('network');

      load({ ...hlsSource, src: 'https://api.test/c.m3u8', fallbackSrc: null });
      emitHlsError(fatalOther);
      expect(component.errorKind()).toBe('media');
      fixture.detectChanges();
      expect(q('.vp-error p')?.textContent).toContain('playerUi.errors.media');
    });

    it('Retry re-requests the source through refreshSource and resumes', () => {
      const fresh: PlaybackSource = { ...hlsSource, src: 'https://api.test/master.m3u8?token=retry', fallbackSrc: null };
      const refresh = jasmine.createSpy('refresh').and.returnValues(throwError(() => new Error('x')), of(fresh));
      const retried = jasmine.createSpy('retried');
      component.retried.subscribe(retried);
      load(hlsSource, refresh);
      emitHlsError(fatal403); // automatic refresh fails → error state
      fixture.detectChanges();

      const button = q('.vp-error .vp-retry') as HTMLButtonElement;
      expect(button).not.toBeNull();
      button.click();
      fixture.detectChanges();

      expect(refresh).toHaveBeenCalledTimes(2);
      expect(retried).toHaveBeenCalledTimes(1);
      expect(loadSource.calls.mostRecent().args[0]).toBe(fresh.src);
      expect(component.srcError()).toBeFalse();
    });

    it('Retry without a refresher reloads the same source', () => {
      load({ ...hlsSource, fallbackSrc: null });
      emitHlsError(fatalOther);
      fixture.detectChanges();
      loadSource.calls.reset();

      (q('.vp-retry') as HTMLButtonElement).click();

      expect(loadSource).toHaveBeenCalledOnceWith(hlsSource.src);
      expect(component.srcError()).toBeFalse();
    });

    it('a refused autoplay (NotAllowedError) is not an error: the play button stays', async () => {
      const refused = Promise.reject(new DOMException('no gesture', 'NotAllowedError'));
      refused.catch(() => undefined);
      spyOn(HTMLMediaElement.prototype, 'play').and.returnValue(refused);
      load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });

      component.togglePlay();
      await refused.catch(() => undefined);
      await Promise.resolve();
      fixture.detectChanges();

      expect(component.srcError()).toBeFalse();
      expect(component.loading()).toBeFalse();
      expect(q('.vp-center-play')).not.toBeNull();
    });

    it('any other play() failure shows the error state', async () => {
      const failed = Promise.reject(new DOMException('bad', 'NotSupportedError'));
      failed.catch(() => undefined);
      spyOn(HTMLMediaElement.prototype, 'play').and.returnValue(failed);
      load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });

      component.togglePlay();
      await failed.catch(() => undefined);
      await Promise.resolve();

      expect(component.srcError()).toBeTrue();
      expect(component.errorKind()).toBe('media');
    });
  });

  describe('captions', () => {
    const subs: PlaybackSource['subtitles'] = [
      { id: 1, language_code: 'en', language_name: 'English', url: 'data:text/vtt,WEBVTT', is_default: true, ordering: 0 },
      { id: 2, language_code: 'fr', language_name: 'Français', url: 'data:text/vtt,WEBVTT', is_default: false, ordering: 1 },
    ];
    const modes = () => Array.from(video().textTracks).map(t => t.mode);

    beforeEach(() => load({ ...hlsSource, subtitles: subs }));

    it('starts on the default track and switches <track> modes from the menu, incl. Off', () => {
      expect(component.activeTrack()).toBe(0);
      component.toggleCaptionsMenu();
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.vp-captions-menu button') as NodeListOf<HTMLButtonElement>;
      expect(items.length).toBe(3); // Off + 2 languages

      items[2].click();
      expect(component.activeTrack()).toBe(1);
      expect(modes()).toEqual(['disabled', 'showing']);

      component.toggleCaptionsMenu();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.vp-captions-menu button') as HTMLButtonElement).click();
      expect(component.activeTrack()).toBe(-1);
      expect(modes()).toEqual(['disabled', 'disabled']);
    });

    it('the C key toggles captions off and back to the last language', () => {
      component.setCaption(1);
      const wrapper = fixture.nativeElement.querySelector('.vp-wrapper') as HTMLElement;
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      expect(component.activeTrack()).toBe(-1);
      wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
      expect(component.activeTrack()).toBe(1);
      expect(modes()).toEqual(['disabled', 'showing']);
    });
  });

  describe('keyboard', () => {
    let wrapper: HTMLElement;
    const press = (key: string, target: HTMLElement = wrapper) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e;
    };

    beforeEach(() => {
      load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });
      wrapper = fixture.nativeElement.querySelector('.vp-wrapper');
    });

    it('space and k toggle playback', () => {
      const toggle = spyOn(component, 'togglePlay');
      expect(press(' ').defaultPrevented).toBeTrue();
      press('k');
      expect(toggle).toHaveBeenCalledTimes(2);
    });

    it('arrows seek and change the volume; m mutes', () => {
      const rewind = spyOn(component, 'rewind');
      const forward = spyOn(component, 'forward');
      press('ArrowLeft');
      press('ArrowRight');
      expect(rewind).toHaveBeenCalledTimes(1);
      expect(forward).toHaveBeenCalledTimes(1);

      video().volume = 0.5;
      press('ArrowUp');
      expect(video().volume).toBeCloseTo(0.6, 5);
      press('ArrowDown');
      press('ArrowDown');
      expect(video().volume).toBeCloseTo(0.4, 5);

      press('m');
      expect(video().muted).toBeTrue();
    });

    it('f toggles fullscreen', () => {
      const fs = spyOn(component, 'toggleFullscreen');
      press('f');
      expect(fs).toHaveBeenCalled();
    });

    it('Escape closes an open menu (preventDefault keeps the dialog open) and is left alone otherwise', () => {
      component.qualityLevels.set([{ index: -1, label: 'playerUi.auto', bitrate: 0 }, { index: 0, label: '720p', bitrate: 1 }]);
      fixture.detectChanges();
      component.toggleQualityMenu();
      fixture.detectChanges();
      const item = fixture.nativeElement.querySelector('.vp-quality-menu button') as HTMLElement;

      const e = press('Escape', item);
      expect(e.defaultPrevented).toBeTrue();
      expect(component.showQualityMenu()).toBeFalse();

      expect(press('Escape').defaultPrevented).toBeFalse();
    });

    it('arrow keys move between quality menu items without seeking', () => {
      const forward = spyOn(component, 'forward');
      component.qualityLevels.set([{ index: -1, label: 'playerUi.auto', bitrate: 0 }, { index: 0, label: '720p', bitrate: 1 }]);
      fixture.detectChanges();
      component.toggleQualityMenu();
      fixture.detectChanges();
      const items = fixture.nativeElement.querySelectorAll('.vp-quality-menu button') as NodeListOf<HTMLElement>;
      items[0].focus();
      press('ArrowDown', items[0]);
      expect(document.activeElement).toBe(items[1]);
      press('ArrowRight', items[1]);
      expect(forward).not.toHaveBeenCalled();
    });
  });

  describe('progress reporting', () => {
    let events: PlaybackProgress[];
    const reasons = () => events.map(e => e.reason);

    beforeEach(() => {
      events = [];
      component.progressUpdate.subscribe(e => events.push(e));
      load({ src: 'https://r2.test/film.mp4?sig', type: 'mp4', fallbackSrc: null, subtitles: [] });
    });

    it('emits every 15 s while playing and stops on pause', () => {
      jasmine.clock().install();
      try {
        video().dispatchEvent(new Event('play'));
        jasmine.clock().tick(15_000);
        jasmine.clock().tick(15_000);
        video().dispatchEvent(new Event('pause'));
        jasmine.clock().tick(30_000);
      } finally {
        jasmine.clock().uninstall();
      }
      expect(reasons()).toEqual(['interval', 'interval', 'pause']);
    });

    it('emits ended before videoEnded', () => {
      const order: string[] = [];
      component.progressUpdate.subscribe(e => order.push(e.reason));
      component.videoEnded.subscribe(() => order.push('videoEnded'));
      video().dispatchEvent(new Event('ended'));
      expect(order).toEqual(['ended', 'videoEnded']);
    });

    it('emits unload on pagehide and when the page becomes hidden', () => {
      window.dispatchEvent(new Event('pagehide'));
      const vis = spyOnProperty(document, 'visibilityState').and.returnValue('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      vis.and.returnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(reasons()).toEqual(['unload', 'unload']);
    });

    it('emits close on destroy and then stops listening', () => {
      fixture.destroy();
      window.dispatchEvent(new Event('pagehide'));
      expect(reasons()).toEqual(['close']);
    });

    it('includes the position and duration from the video element', () => {
      window.dispatchEvent(new Event('pagehide'));
      expect(events[0]).toEqual(jasmine.objectContaining({ position: video().currentTime, reason: 'unload' }));
      expect('duration' in events[0]).toBeTrue();
    });
  });
});
