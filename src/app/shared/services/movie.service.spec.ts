import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
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
  let device: { getId: () => Observable<string | null>; reset: jasmine.Spy };

  beforeEach(() => {
    deviceId = 'device-abc';
    device = { getId: () => of(deviceId), reset: jasmine.createSpy('reset').and.callFake(() => { deviceId = 'device-new'; }) };
    TestBed.configureTestingModule({
      providers: [
        MovieService, provideHttpClient(), provideHttpClientTesting(),
        { provide: DeviceIdService, useValue: device },
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

    it('on 403 device_invalid gets a new device id and retries exactly once', () => {
      let result: StreamResponse | undefined;
      service.getStream(12).subscribe(r => (result = r));

      const first = http.expectOne(STREAM_URL);
      expect(first.request.headers.get('X-Device-Id')).toBe('device-abc');
      first.flush({ error: 'Invalid device.', code: 'device_invalid' }, { status: 403, statusText: 'Forbidden' });

      expect(device.reset).toHaveBeenCalledTimes(1);
      const second = http.expectOne(STREAM_URL);
      expect(second.request.headers.get('X-Device-Id')).toBe('device-new');
      second.flush(makeStreamResponse());
      expect(result).toBeDefined();
    });

    it('does not loop when the retry is refused as device_invalid again', () => {
      let error: HttpErrorResponse | undefined;
      service.getStream(12).subscribe({ error: e => (error = e) });
      const refuse = () => http.expectOne(STREAM_URL).flush(
        { error: 'Invalid device.', code: 'device_invalid' }, { status: 403, statusText: 'Forbidden' });
      refuse();
      refuse();
      http.expectNone(STREAM_URL);
      expect(error?.status).toBe(403);
      expect(device.reset).toHaveBeenCalledTimes(1);
    });

    it('does not retry other 403 refusals', () => {
      service.getStream(12).subscribe({ error: () => undefined });
      http.expectOne(STREAM_URL).flush({ error: 'x', code: 'other_device' }, { status: 403, statusText: 'Forbidden' });
      http.expectNone(STREAM_URL);
      expect(device.reset).not.toHaveBeenCalled();
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

  describe('getGenreOptions()', () => {
    it('asks for every active genre and returns the names', () => {
      let names: string[] = [];
      service.getGenreOptions().subscribe(n => (names = n));
      const req = http.expectOne(r => r.url === `${environment.apiUrl}/movies/genres/`);
      expect(req.request.params.get('include_empty')).toBe('1');
      req.flush({ results: [{ name: 'Drama', slug: 'drama', count: 2 }, { name: 'Horror', slug: 'horror', count: 0 }], languages: [] });
      expect(names).toEqual(['Drama', 'Horror']);
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
