import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { StreamResponse } from '../models/movie-api.interface';
import { makeStreamResponse } from '../testing/stream-fixtures';
import { MovieService, toPlaybackSource } from './movie.service';

const STREAM_URL = `${environment.apiUrl}/movies/12/stream/`;

describe('MovieService', () => {
  let service: MovieService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MovieService, provideHttpClient(), provideHttpClientTesting()],
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
