import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { WatchProgressService } from './watch-progress.service';

const URL = `${environment.apiUrl}/movies/12/progress/`;

describe('WatchProgressService', () => {
  let service: WatchProgressService;
  let http: HttpTestingController;
  let fetchSpy: jasmine.Spy;

  const setup = (platform: 'browser' | 'server' = 'browser') => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AuthService, useValue: { getAccessToken: () => 'access-123' } },
      ],
    });
    service = TestBed.inject(WatchProgressService);
    http = TestBed.inject(HttpTestingController);
  };

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response(null, { status: 200 })));
  });
  afterEach(() => http.verify());

  for (const reason of ['interval', 'pause', 'close'] as const) {
    it(`posts whole seconds via HttpClient on ${reason}`, async () => {
      setup();
      const done = service.report(12, { position: 612.7, duration: 6000.4, reason });

      const req = http.expectOne(URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ progress_seconds: 612, duration_seconds: 6000 });
      req.flush({});
      await done;
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }

  it('reports progress == duration on ended so the view completes (>= 90 %)', () => {
    setup();
    service.report(12, { position: 10, duration: 6000.4, reason: 'ended' });
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ progress_seconds: 6000, duration_seconds: 6000 });
    req.flush({});
  });

  it('uses a keepalive fetch with the bearer token on unload', () => {
    setup();
    service.report(12, { position: 300.9, duration: 6000, reason: 'unload' });

    http.expectNone(URL);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.calls.mostRecent().args as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBeTrue();
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-123');
    expect(JSON.parse(init.body as string)).toEqual({ progress_seconds: 300, duration_seconds: 6000 });
  });

  it('never exceeds the duration', () => {
    setup();
    service.report(12, { position: 7000, duration: 6000, reason: 'pause' });
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ progress_seconds: 6000, duration_seconds: 6000 });
    req.flush({});
  });

  it('skips positions under 5 s and unknown durations', () => {
    setup();
    service.report(12, { position: 3, duration: 6000, reason: 'pause' });
    service.report(12, { position: 100, duration: NaN, reason: 'pause' });
    service.report(12, { position: 100, duration: Infinity, reason: 'unload' });
    http.expectNone(URL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves even when the request fails', async () => {
    setup();
    const done = service.report(12, { position: 100, duration: 6000, reason: 'close' });
    http.expectOne(URL).flush({ error: 'You have not purchased this movie.' }, { status: 403, statusText: 'Forbidden' });
    await expectAsync(done).toBeResolved();
  });

  it('does nothing on the server', () => {
    setup('server');
    service.report(12, { position: 100, duration: 6000, reason: 'pause' });
    service.report(12, { position: 100, duration: 6000, reason: 'unload' });
    http.expectNone(URL);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
