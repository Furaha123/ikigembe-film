import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

const api = environment.apiUrl;
const refreshUrl = `${api}/auth/token/refresh/`;
const KEYS = ['ikigembe_session', 'ikigembe_token', 'ikigembe_refresh', 'ikigembe_name', 'ikigembe_email',
  'ikigembe_is_staff', 'ikigembe_role', 'ikigembe_account_status', 'ikigembe_suspension_reason', 'ikigembe_onboarded'];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
/** Let pending work run (e.g. a response feeding a retry). */
const settle = tick;

describe('authInterceptor + AuthService tokens', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;
  let navigate: jasmine.Spy;

  function setUp() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
  }

  async function signIn() {
    const done = firstValueFrom(auth.login('a@b.rw', 'pw'));
    backend.expectOne(`${api}/auth/login/`).flush({ access: 'access-1', refresh: 'ignored', user: { role: 'Viewer' } });
    await done;
  }

  const authHeader = (req: TestRequest) => req.request.headers.get('Authorization');

  /** The refresh request, once the cross-tab lock (navigator.locks) has been granted. */
  async function refreshRequest(): Promise<TestRequest> {
    for (let i = 0; i < 40; i++) {
      const [req] = backend.match(refreshUrl);
      if (req) return req;
      await tick();
    }
    throw new Error('no refresh request was sent');
  }

  beforeEach(() => KEYS.forEach((k) => localStorage.removeItem(k)));
  afterEach(() => {
    backend.verify();
    KEYS.forEach((k) => localStorage.removeItem(k));
  });

  it('keeps the access token in memory only and sends it as a Bearer header', async () => {
    setUp();
    await signIn();

    expect(auth.isLoggedIn()).toBeTrue();
    expect(localStorage.getItem('ikigembe_session')).toBe('1');
    expect(Object.keys(localStorage).some((k) => localStorage.getItem(k)?.includes('access-1'))).toBeFalse();
    expect(localStorage.getItem('ikigembe_refresh')).toBeNull();

    http.get(`${api}/movies/`).subscribe();
    const req = backend.expectOne(`${api}/movies/`);
    expect(authHeader(req)).toBe('Bearer access-1');
    req.flush([]);
  });

  it('leaves non-API requests (e.g. presigned storage URLs) untouched', async () => {
    setUp();
    await signIn();
    http.put('https://bucket.r2.example/part?sig=x', 'bytes').subscribe();
    const req = backend.expectOne('https://bucket.r2.example/part?sig=x');
    expect(authHeader(req)).toBeNull();
    req.flush(null);
  });

  it('after a reload, trades the cookie for one access token shared by concurrent requests', async () => {
    localStorage.setItem('ikigembe_session', '1');
    setUp();
    expect(auth.isLoggedIn()).toBeTrue();

    http.get(`${api}/movies/`).subscribe();
    http.get(`${api}/auth/me/`).subscribe();

    const refresh = await refreshRequest();
    expect(refresh.request.body).toEqual({});
    expect(authHeader(refresh)).toBeNull();
    refresh.flush({ access: 'access-2' });
    await settle();

    expect(authHeader(backend.expectOne(`${api}/movies/`))).toBe('Bearer access-2');
    expect(authHeader(backend.expectOne(`${api}/auth/me/`))).toBe('Bearer access-2');
  });

  it('migrates a refresh token stored before the cookie, then forgets it', async () => {
    localStorage.setItem('ikigembe_token', 'old-access');
    localStorage.setItem('ikigembe_refresh', 'old-refresh');
    setUp();
    expect(auth.isLoggedIn()).toBeTrue();

    http.get(`${api}/movies/`).subscribe();
    const refresh = await refreshRequest();
    expect(refresh.request.body).toEqual({ refresh: 'old-refresh' });
    refresh.flush({ access: 'access-3', refresh: 'rotated' });
    await settle();

    backend.expectOne(`${api}/movies/`).flush([]);
    expect(localStorage.getItem('ikigembe_token')).toBeNull();
    expect(localStorage.getItem('ikigembe_refresh')).toBeNull();
    expect(localStorage.getItem('ikigembe_session')).toBe('1');
  });

  it('signed out: no refresh attempt and no Authorization header', async () => {
    setUp();
    http.get(`${api}/movies/`).subscribe();
    await settle();
    backend.expectNone(refreshUrl);
    expect(authHeader(backend.expectOne(`${api}/movies/`))).toBeNull();
  });

  it('on a 401, refreshes once and retries with the new token', async () => {
    setUp();
    await signIn();

    let body: unknown;
    http.get(`${api}/movies/`).subscribe((b) => (body = b));
    backend.expectOne(`${api}/movies/`).flush({ error: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    (await refreshRequest()).flush({ access: 'access-4' });
    await settle();
    const retry = backend.expectOne(`${api}/movies/`);
    expect(authHeader(retry)).toBe('Bearer access-4');
    retry.flush(['ok']);
    expect(body).toEqual(['ok']);
  });

  it('when the refresh is refused, ends the session and sends the user to sign in', async () => {
    setUp();
    await signIn();

    let error: HttpErrorResponse | undefined;
    http.get(`${api}/movies/`).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    backend.expectOne(`${api}/movies/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    (await refreshRequest()).flush({ error: 'Token is blacklisted' }, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(error?.status).toBe(401);
    expect(auth.isLoggedIn()).toBeFalse();
    expect(auth.getAccessToken()).toBeNull();
    expect(localStorage.getItem('ikigembe_session')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('keeps the session when the refresh fails for another reason (e.g. offline)', async () => {
    localStorage.setItem('ikigembe_session', '1');
    setUp();

    http.get(`${api}/movies/`).subscribe({ error: () => undefined });
    (await refreshRequest()).error(new ProgressEvent('error'));
    await settle();
    backend.expectOne(`${api}/movies/`).flush([]);

    expect(auth.isLoggedIn()).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('logout asks the API to revoke the cookie and clears the local session', async () => {
    setUp();
    await signIn();
    let done = false;
    auth.logout(() => (done = true));
    await settle();

    const req = backend.expectOne(`${api}/auth/logout/`);
    expect(req.request.body).toEqual({});
    expect(authHeader(req)).toBe('Bearer access-1');
    req.flush(null, { status: 205, statusText: 'Reset Content' });

    expect(done).toBeTrue();
    expect(auth.isLoggedIn()).toBeFalse();
    expect(auth.getAccessToken()).toBeNull();
    expect(localStorage.getItem('ikigembe_session')).toBeNull();
  });
});
