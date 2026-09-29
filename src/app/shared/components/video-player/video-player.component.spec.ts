import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import Hls from 'hls.js';
import { PlaybackSource } from '../../models/movie-api.interface';
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
});
