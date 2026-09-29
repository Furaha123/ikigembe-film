import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { PAYMENT_POLL_INTERVAL_MS, PAYMENT_POLL_MAX_ATTEMPTS, PaymentService, PaymentStatusResponse } from './payment.service';

const statusUrl = `${environment.apiUrl}/payments/dep-1/status/`;
const status = (s: PaymentStatusResponse['status']): PaymentStatusResponse => ({
  deposit_id: 'dep-1', status: s, amount: 5000, currency: 'RWF', purpose: 'actor_search',
  movie_id: null, movie_title: null, created_at: '2026-09-29T10:00:00Z',
});

describe('PaymentService.pollUntilSettled', () => {
  let service: PaymentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('polls until Completed, emits the final status and completes', fakeAsync(() => {
    const seen: string[] = [];
    let done = false;
    service.pollUntilSettled('dep-1').subscribe({ next: r => seen.push(r.status), complete: () => (done = true) });

    tick(PAYMENT_POLL_INTERVAL_MS);
    http.expectOne(statusUrl).flush(status('Pending'));
    tick(PAYMENT_POLL_INTERVAL_MS);
    http.expectOne(statusUrl).flush(status('Completed'));

    expect(seen).toEqual(['Pending', 'Completed']);
    expect(done).toBeTrue();
    tick(PAYMENT_POLL_INTERVAL_MS * 3);
    http.expectNone(statusUrl);
  }));

  it('stops on Failed', fakeAsync(() => {
    const seen: string[] = [];
    service.pollUntilSettled('dep-1').subscribe(r => seen.push(r.status));
    tick(PAYMENT_POLL_INTERVAL_MS);
    http.expectOne(statusUrl).flush(status('Failed'));
    tick(PAYMENT_POLL_INTERVAL_MS * 2);
    http.expectNone(statusUrl);
    expect(seen).toEqual(['Failed']);
  }));

  it('gives up after the maximum number of attempts', fakeAsync(() => {
    let done = false;
    service.pollUntilSettled('dep-1').subscribe({ complete: () => (done = true) });
    for (let i = 0; i < PAYMENT_POLL_MAX_ATTEMPTS; i++) {
      tick(PAYMENT_POLL_INTERVAL_MS);
      http.expectOne(statusUrl).flush(status('Pending'));
    }
    expect(done).toBeTrue();
    tick(PAYMENT_POLL_INTERVAL_MS);
    http.expectNone(statusUrl);
    discardPeriodicTasks();
  }));

  it('typed history items carry the purpose', () => {
    service.getHistory().subscribe(res => expect(res.results[0].purpose).toBe('casting_announcement'));
    http.expectOne(`${environment.apiUrl}/payments/history/`).flush({
      count: 1,
      results: [{ deposit_id: 'd', purpose: 'casting_announcement', movie_id: null, movie_title: null, amount: 1, currency: 'RWF', status: 'Completed', created_at: '' }],
    });
  });
});
