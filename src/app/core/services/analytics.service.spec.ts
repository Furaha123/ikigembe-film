import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';
import { AuthService } from './auth.service';

/** The fields of a sent event these specs read. */
interface SentEvent { id: string; visitor: string; name: string; path: string; movie_id?: number }

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch').and.returnValue(Promise.resolve(new Response('{}', { status: 202 })));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { getAccessToken: () => null } }],
    });
    service = TestBed.inject(AnalyticsService);
  });

  function sentEvents(call = 0): SentEvent[] {
    return JSON.parse(fetchSpy.calls.argsFor(call)[1].body).events;
  }

  it('batches events and sends them with keepalive, without query strings', () => {
    service.track('page_view', { path: '/films?genre=drama&token=abc' });
    service.track('trailer_play', { movie_id: 7, props: { source: 'detail' } });
    expect(fetchSpy).not.toHaveBeenCalled();
    service.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.calls.argsFor(0);
    expect(url).toContain('/analytics/events/');
    expect(init.keepalive).toBeTrue();
    expect(init.headers.Authorization).toBeUndefined();
    const events = sentEvents();
    expect(events.map(e => e.name)).toEqual(['page_view', 'trailer_play']);
    expect(events[0].path).toBe('/films');
    expect(events[1].movie_id).toBe(7);
    expect(events[0].visitor).toBe(events[1].visitor);
    expect(events[0].id).not.toBe(events[1].id);
  });

  it('sends at most 20 events per request', () => {
    for (let i = 0; i < 25; i++) service.track('page_view', { path: '/browse' });
    service.flush();
    expect(fetchSpy.calls.count()).toBe(2);
    expect(sentEvents(0).length).toBe(20);
    expect(sentEvents(1).length).toBe(5);
  });

  it('does nothing when the queue is empty', () => {
    service.flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
