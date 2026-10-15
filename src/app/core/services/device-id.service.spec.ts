import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { DEVICE_ID_KEY, DEVICE_KEY, DeviceIdService } from './device-id.service';

const DEVICE_URL = `${environment.apiUrl}/movies/device/`;

describe('DeviceIdService', () => {
  let http: HttpTestingController;
  const email = signal('buyer@example.com');

  const create = (platform: 'browser' | 'server' = 'browser') => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: AuthService, useValue: { userEmail: email, userName: signal('') } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(DeviceIdService);
  };

  const clear = () => { localStorage.removeItem(DEVICE_ID_KEY); localStorage.removeItem(DEVICE_KEY); };
  beforeEach(() => { clear(); email.set('buyer@example.com'); });
  afterEach(() => { http.verify(); clear(); });

  it('asks the API once, stores the signed id for this user and reuses it', () => {
    const service = create();
    let id: string | null = null;
    service.getId().subscribe(v => (id = v));
    const req = http.expectOne(DEVICE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ device_id: 'abc:sig', enforced: true });

    expect(id as string | null).toBe('abc:sig');
    expect(JSON.parse(localStorage.getItem(DEVICE_KEY)!)).toEqual({ user: 'buyer@example.com', id: 'abc:sig' });

    service.getId().subscribe(v => (id = v));
    http.expectNone(DEVICE_URL);
    expect(id as string | null).toBe('abc:sig');
  });

  it('reuses a stored id after a reload', () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: 'buyer@example.com', id: 'stored:sig' }));
    let id: string | null = null;
    create().getId().subscribe(v => (id = v));
    http.expectNone(DEVICE_URL);
    expect(id as string | null).toBe('stored:sig');
  });

  it('requests a new id when another account signs in', () => {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ user: 'someone@example.com', id: 'other:sig' }));
    let id: string | null = null;
    create().getId().subscribe(v => (id = v));
    http.expectOne(DEVICE_URL).flush({ device_id: 'mine:sig', enforced: false });
    expect(id as string | null).toBe('mine:sig');
  });

  it('sends the old browser UUID as legacy_id and never deletes it', () => {
    localStorage.setItem(DEVICE_ID_KEY, '0b8f6d2e-1c3a-4e5f-9a7b-123456789abc');
    create().getId().subscribe();
    const req = http.expectOne(DEVICE_URL);
    expect(req.request.body).toEqual({ legacy_id: '0b8f6d2e-1c3a-4e5f-9a7b-123456789abc' });
    req.flush({ device_id: 'wrapped:sig', enforced: true });
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe('0b8f6d2e-1c3a-4e5f-9a7b-123456789abc');
  });

  it('shares one in-flight request between concurrent callers', () => {
    const service = create();
    const ids: (string | null)[] = [];
    service.getId().subscribe(v => ids.push(v));
    service.getId().subscribe(v => ids.push(v));
    http.expectOne(DEVICE_URL).flush({ device_id: 'one:sig', enforced: true });
    expect(ids).toEqual(['one:sig', 'one:sig']);
  });

  it('reset() forgets the id so the next call asks again', () => {
    const service = create();
    service.getId().subscribe();
    http.expectOne(DEVICE_URL).flush({ device_id: 'old:sig', enforced: true });
    service.reset();
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
    let id: string | null = null;
    service.getId().subscribe(v => (id = v));
    http.expectOne(DEVICE_URL).flush({ device_id: 'new:sig', enforced: true });
    expect(id as string | null).toBe('new:sig');
  });

  it('yields null when the API refuses (the stream call then shows its usual error)', () => {
    let id: string | null | undefined;
    create().getId().subscribe(v => (id = v));
    http.expectOne(DEVICE_URL).flush({}, { status: 500, statusText: 'Server Error' });
    expect(id).toBeNull();
  });

  it('returns null on the server without any request', () => {
    let id: string | null | undefined;
    create('server').getId().subscribe(v => (id = v));
    http.expectNone(DEVICE_URL);
    expect(id).toBeNull();
  });
});
