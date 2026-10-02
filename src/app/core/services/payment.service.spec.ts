import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { PAYMENT_POLL_MAX_ATTEMPTS, PAYMENT_POLL_SCHEDULE_MS, PaymentService, PaymentStatusResponse } from './payment.service';

const statusUrl = `${environment.apiUrl}/payments/dep-1/status/`;
const status = (s: PaymentStatusResponse['status']): PaymentStatusResponse => ({
  deposit_id: 'dep-1', status: s, amount: 5000, currency: 'RWF', purpose: 'actor_search',
  movie_id: null, movie_title: null, created_at: '2026-09-29T10:00:00Z',
});

describe('PaymentService.pollUntilSettled', () => {
  let service: PaymentService;
  let http: HttpTestingController;
  /** Advance to the n-th scheduled status check (0-based). */
  const toCheck = (n: number) => tick(PAYMENT_POLL_SCHEDULE_MS[n]);

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

    toCheck(0);
    http.expectOne(statusUrl).flush(status('Pending'));
    toCheck(1);
    http.expectOne(statusUrl).flush(status('Completed'));

    expect(seen).toEqual(['Pending', 'Completed']);
    expect(done).toBeTrue();
    tick(60_000);
    http.expectNone(statusUrl);
  }));

  it('stops on Failed', fakeAsync(() => {
    const seen: string[] = [];
    service.pollUntilSettled('dep-1').subscribe(r => seen.push(r.status));
    toCheck(0);
    http.expectOne(statusUrl).flush(status('Failed'));
    tick(60_000);
    http.expectNone(statusUrl);
    expect(seen).toEqual(['Failed']);
  }));

  it('backs off between checks instead of polling at a fixed rate', () => {
    expect(PAYMENT_POLL_SCHEDULE_MS[0]).toBe(3000);
    expect(PAYMENT_POLL_SCHEDULE_MS.at(-1)).toBe(10000);
    for (let i = 1; i < PAYMENT_POLL_SCHEDULE_MS.length; i++) {
      expect(PAYMENT_POLL_SCHEDULE_MS[i]).toBeGreaterThanOrEqual(PAYMENT_POLL_SCHEDULE_MS[i - 1]);
    }
    const totalMs = PAYMENT_POLL_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    expect(totalMs).toBeGreaterThan(120_000); // longer than the old 60 s window
  });

  it('keeps polling through a transient error (network / 5xx)', fakeAsync(() => {
    const seen: string[] = [];
    let error: unknown = null;
    service.pollUntilSettled('dep-1').subscribe({ next: r => seen.push(r.status), error: e => (error = e) });
    toCheck(0);
    http.expectOne(statusUrl).flush(null, { status: 502, statusText: 'Bad Gateway' });
    toCheck(1);
    http.expectOne(statusUrl).flush(status('Completed'));
    expect(error).toBeNull();
    expect(seen).toEqual(['Completed']);
  }));

  it('errors on a non-transient failure (e.g. 404 unknown deposit)', fakeAsync(() => {
    let error: unknown = null;
    service.pollUntilSettled('dep-1').subscribe({ error: e => (error = e) });
    toCheck(0);
    http.expectOne(statusUrl).flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
    expect(error).not.toBeNull();
    tick(60_000);
    http.expectNone(statusUrl);
  }));

  it('completes while still Pending after the last scheduled check (never reports a failure itself)', fakeAsync(() => {
    let done = false;
    const seen: string[] = [];
    service.pollUntilSettled('dep-1').subscribe({ next: r => seen.push(r.status), complete: () => (done = true) });
    for (let i = 0; i < PAYMENT_POLL_MAX_ATTEMPTS; i++) {
      toCheck(i);
      http.expectOne(statusUrl).flush(status('Pending'));
    }
    expect(done).toBeTrue();
    expect(seen.every(s => s === 'Pending')).toBeTrue();
    tick(60_000);
    http.expectNone(statusUrl);
  }));

  it('typed history items carry the purpose', () => {
    service.getHistory().subscribe(res => expect(res.results[0].purpose).toBe('casting_announcement'));
    http.expectOne(`${environment.apiUrl}/payments/history/`).flush({
      count: 1,
      results: [{ deposit_id: 'd', purpose: 'casting_announcement', movie_id: null, movie_title: null, amount: 1, currency: 'RWF', status: 'Completed', created_at: '' }],
    });
  });
});

describe('PaymentService pending deposits', () => {
  let service: PaymentService;

  beforeEach(() => {
    sessionStorage.removeItem('ikigembe_pending_payments');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentService);
  });
  afterEach(() => sessionStorage.removeItem('ikigembe_pending_payments'));

  it('remembers, returns and forgets an unsettled deposit per item', () => {
    service.rememberPending('movie:12', 'dep-a');
    service.rememberPending('movie:13', 'dep-b');
    expect(service.pendingDeposit('movie:12')).toBe('dep-a');
    service.forgetPending('movie:12');
    expect(service.pendingDeposit('movie:12')).toBeNull();
    expect(service.pendingDeposit('movie:13')).toBe('dep-b');
  });

  it('stores nothing in localStorage and clears the key when empty', () => {
    service.rememberPending('movie:1', 'dep-x');
    service.forgetPending('movie:1');
    expect(sessionStorage.getItem('ikigembe_pending_payments')).toBeNull();
    expect(Object.keys(localStorage).some(k => k.includes('pending'))).toBeFalse();
  });

  it('ignores corrupt storage', () => {
    sessionStorage.setItem('ikigembe_pending_payments', '{not json');
    expect(service.pendingDeposit('movie:1')).toBeNull();
  });
});


describe('PaymentService hosted-page helpers', () => {
  let service: PaymentService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.removeItem('ikigembe_payment_returns');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PaymentService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); sessionStorage.removeItem('ikigembe_payment_returns'); });

  it('only follows DPO hosted pages (https) or the in-app demo checkout', () => {
    expect(service.paymentPageTarget('https://secure.3gdirectpay.com/payv2.php?ID=T')).toEqual({ external: 'https://secure.3gdirectpay.com/payv2.php?ID=T' });
    expect(service.paymentPageTarget('https://payv4.uat.directpay.online/?ID=T')).toEqual({ external: 'https://payv4.uat.directpay.online/?ID=T' });
    expect(service.paymentPageTarget('/payment/demo-checkout?deposit=d')).toEqual({ internal: '/payment/demo-checkout?deposit=d' });
    for (const bad of ['http://secure.3gdirectpay.com/x', 'https://evil.example/pay', 'https://3gdirectpay.com.evil.example/', 'javascript:alert(1)', '', null]) {
      expect(service.paymentPageTarget(bad)).withContext(String(bad)).toBeNull();
    }
  });

  it('falls back to the MoMo flow if the config endpoint is missing, and caches it', () => {
    let first: unknown; let second: unknown;
    service.getConfig().subscribe(c => (first = c));
    http.expectOne(`${environment.apiUrl}/payments/config/`).flush(null, { status: 404, statusText: 'Not Found' });
    service.getConfig().subscribe(c => (second = c));
    http.expectNone(`${environment.apiUrl}/payments/config/`);
    expect(first).toEqual({ gateway: 'pawapay', needs_phone: true, redirect: false, demo: false });
    expect(second).toEqual(first);
  });

  it('remembers where to return per deposit and rejects malformed entries', () => {
    service.rememberReturn('d-1', { kind: 'movie', movieId: 12 });
    service.rememberReturn('d-2', { kind: 'service', returnTo: '/actor/videos' });
    expect(service.returnContext('d-1')).toEqual({ kind: 'movie', movieId: 12 });
    expect(service.returnContext('d-2')).toEqual({ kind: 'service', returnTo: '/actor/videos' });
    sessionStorage.setItem('ikigembe_payment_returns', JSON.stringify({ x: { kind: 'movie', movieId: 'nope' } }));
    expect(service.returnContext('x')).toBeNull();
  });
});
