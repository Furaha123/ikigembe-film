import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import {
  AuthService, RESEND_COOLDOWN_SECONDS, RESEND_RATE_LIMITED_COOLDOWN_SECONDS, ResendVerificationResult, resendCooldownLabel,
} from './auth.service';

const URL = `${environment.apiUrl}/auth/resend-verification/`;

describe('AuthService.requestVerificationEmail', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let result: ResendVerificationResult | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    result = undefined;
  });
  afterEach(() => http.verify());

  it('200 → sent, short cooldown, no extra wording (same for known and unknown emails)', () => {
    service.requestVerificationEmail('someone@example.com').subscribe(r => (result = r));
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ email: 'someone@example.com' });
    req.flush({ detail: 'If an account exists, a link was sent.' });
    expect(result).toEqual({ sent: true, message: null, cooldownSeconds: RESEND_COOLDOWN_SECONDS });
  });

  it('429 → translated message (not the English detail) and the long cooldown', () => {
    service.requestVerificationEmail('a@b.rw').subscribe(r => (result = r));
    http.expectOne(URL).flush(
      { detail: 'Too many requests. Please wait before requesting another link.' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    expect(result).toEqual({ sent: false, message: 'auth.common.resendTooMany', cooldownSeconds: RESEND_RATE_LIMITED_COOLDOWN_SECONDS });
    expect(RESEND_RATE_LIMITED_COOLDOWN_SECONDS).toBe(15 * 60);
  });

  it('other errors keep showing the backend text, without a cooldown', () => {
    service.requestVerificationEmail('bad').subscribe(r => (result = r));
    http.expectOne(URL).flush({ email: ['Enter a valid email address.'] }, { status: 400, statusText: 'Bad Request' });
    expect(result).toEqual({ sent: false, message: 'Enter a valid email address.', cooldownSeconds: 0 });
  });

  it('errors without a message leave the page\'s own fallback to decide', () => {
    service.requestVerificationEmail('a@b.rw').subscribe(r => (result = r));
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Server Error' });
    expect(result).toEqual({ sent: false, message: null, cooldownSeconds: 0 });
  });
});

describe('resendCooldownLabel', () => {
  it('seconds under a minute, whole minutes above', () => {
    expect(resendCooldownLabel(59)).toEqual({ key: 'auth.common.resendIn', n: 59 });
    expect(resendCooldownLabel(60)).toEqual({ key: 'auth.common.resendIn', n: 60 });
    expect(resendCooldownLabel(900)).toEqual({ key: 'auth.common.resendInMinutes', n: 15 });
    expect(resendCooldownLabel(61)).toEqual({ key: 'auth.common.resendInMinutes', n: 2 });
  });
});

describe('AuthService.changePassword', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('sends the confirmation and switches to the new session the API returns', () => {
    service.changePassword('OldPass1!', 'NewPass2!', 'NewPass2!').subscribe();
    const req = http.expectOne(`${environment.apiUrl}/auth/change-password/`);
    expect(req.request.body).toEqual({ current_password: 'OldPass1!', new_password: 'NewPass2!', confirm_password: 'NewPass2!' });
    req.flush({ access: 'new-access', user: { first_name: 'A', last_name: 'B', role: 'Viewer' } });
    expect(service.getAccessToken()).toBe('new-access');
  });
});
