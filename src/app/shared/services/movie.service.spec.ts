import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { StreamResponse } from '../models/movie-api.interface';
import { makeStreamResponse } from '../testing/stream-fixtures';
import { DeviceIdService } from '../../core/services/device-id.service';
import { MovieService, toPlaybackSource } from './movie.service';

const STREAM_URL = `${environment.apiUrl}/movies/12/stream/`;

describe('MovieService', () => {
  let service: MovieService;
  let http: HttpTestingController;
  let deviceId: string | null;

  beforeEach(() => {
    deviceId = 'device-abc';
    TestBed.configureTestingModule({
      providers: [
        MovieService, provideHttpClient(), provideHttpClientTesting(),
        { provide: DeviceIdService, useValue: { getId: () => deviceId } },
      ],
    });
    service = TestBed.inject(MovieService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getStream()', () => {
    it('GETs /movies/<id>/stream/ and returns the typed response', () => {
      const body = makeStreamResponse();
      let result: StreamResponse | undefined;
      service.getStream(12).subscribe(r => (result = r));

      const req = http.expectOne(STREAM_URL);
      expect(req.request.method).toBe('GET');
      req.flush(body);

      expect(result).toEqual(body);
    });

    it('surfaces 403 purchase-required with the backend message', () => {
      let error: HttpErrorResponse | undefined;
      service.getStream(12).subscribe({ error: e => (error = e) });

      http.expectOne(STREAM_URL).flush(
        { error: 'Purchase required to stream this movie.' },
        { status: 403, statusText: 'Forbidden' },
      );

      expect(error?.status).toBe(403);
      expect(error?.error).toEqual({ error: 'Purchase required to stream this movie.' });
    });

    it('surfaces 404 movie not found', () => {
      let error: HttpErrorResponse | undefined;
      service.getStream(12).subscribe({ error: e => (error = e) });

      http.expectOne(STREAM_URL).flush({ error: 'Movie not found' }, { status: 404, statusText: 'Not Found' });

      expect(error?.status).toBe(404);
    });
  });

  describe('X-Device-Id header', () => {
    it('is sent on /stream/', () => {
      service.getStream(12).subscribe();
      const req = http.expectOne(STREAM_URL);
      expect(req.request.headers.get('X-Device-Id')).toBe('device-abc');
      req.flush(makeStreamResponse());
    });

    it('is not sent on any other movie request', () => {
      service.getMovieDetails(12).subscribe();
      service.getMyList().subscribe();
      service.saveProgress(12, { progress_seconds: 60, duration_seconds: 600 }).subscribe();

      const reqs = http.match(() => true);
      expect(reqs.length).toBe(3);
      for (const r of reqs) {
        expect(r.request.headers.has('X-Device-Id')).withContext(r.request.url).toBeFalse();
        r.flush({});
      }
    });

    it('is omitted when no device id is available (SSR)', () => {
      deviceId = null;
      service.getStream(12).subscribe();
      const req = http.expectOne(STREAM_URL);
      expect(req.request.headers.has('X-Device-Id')).toBeFalse();
      req.flush(makeStreamResponse());
    });
  });

  describe('saveProgress()', () => {
    it('POSTs progress_seconds / duration_seconds', () => {
      service.saveProgress(12, { progress_seconds: 60, duration_seconds: 600 }).subscribe();
      const req = http.expectOne(`${environment.apiUrl}/movies/12/progress/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ progress_seconds: 60, duration_seconds: 600 });
      req.flush({});
    });
  });

  describe('toPlaybackSource()', () => {
    it('plays stream_url unchanged and keeps the MP4 only as fallback', () => {
      const res = makeStreamResponse();
      expect(toPlaybackSource(res)).toEqual({
        src: res.stream_url,
        type: 'hls',
        fallbackSrc: res.fallback_url,
        subtitles: res.subtitles,
      });
    });

    it('handles an MP4-only stream', () => {
      const res = makeStreamResponse({ stream_type: 'mp4', stream_url: 'https://r2.test/m.mp4?sig', fallback_url: null });
      const src = toPlaybackSource(res);
      expect(src.type).toBe('mp4');
      expect(src.src).toBe('https://r2.test/m.mp4?sig');
      expect(src.fallbackSrc).toBeNull();
    });
  });
});
