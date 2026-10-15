import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { EmailVerificationRequiredComponent } from './email-verification-required.component';

const api = environment.apiUrl;
const meUrl = `${api}/auth/me/`;

describe('EmailVerificationRequiredComponent', () => {
  let fixture: ComponentFixture<EmailVerificationRequiredComponent>;
  let backend: HttpTestingController;
  let auth: AuthService;
  let navigate: jasmine.Spy;

  const unverified = { id: 1, email: 'typo@ikigembe.rw', role: 'Viewer', is_staff: false, email_verification_required: true };

  beforeEach(() => {
    localStorage.setItem('ikigembe_session', '1');
    TestBed.configureTestingModule({
      imports: [EmailVerificationRequiredComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl: '/movie/7' }) } } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    fixture = TestBed.createComponent(EmailVerificationRequiredComponent);
    fixture.detectChanges();
    backend.expectOne(meUrl).flush(unverified);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    localStorage.removeItem('ikigembe_session');
    localStorage.removeItem('ikigembe_email');
  });

  it('shows the current address and resends the link to it', () => {
    expect(auth.emailUnverified()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('typo@ikigembe.rw');
    fixture.componentInstance.resend();
    const req = backend.expectOne(`${api}/auth/resend-verification/`);
    expect(req.request.body).toEqual({ email: 'typo@ikigembe.rw' });
    req.flush({ detail: 'Verification email sent.' });
    expect(fixture.componentInstance.resendSuccess()).toBeTrue();
  });

  it('changes a mistyped address', () => {
    fixture.componentInstance.startEditing();
    fixture.componentInstance.newEmail.set('right@ikigembe.rw');
    fixture.componentInstance.saveEmail();
    const req = backend.expectOne(meUrl);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ email: 'right@ikigembe.rw' });
    req.flush({ ...unverified, email: 'right@ikigembe.rw' });
    expect(auth.userEmail()).toBe('right@ikigembe.rw');
    expect(fixture.componentInstance.emailChanged()).toBeTrue();
  });

  it('continues to the page it came from once the account is verified', () => {
    fixture.componentInstance.checkAgain();
    backend.expectOne(meUrl).flush(unverified);
    expect(fixture.componentInstance.stillUnverified()).toBeTrue();
    expect(navigate).not.toHaveBeenCalled();

    fixture.componentInstance.checkAgain();
    backend.expectOne(meUrl).flush({ ...unverified, email_verification_required: false });
    expect(auth.emailUnverified()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith('/movie/7', { replaceUrl: true });
  });
});
