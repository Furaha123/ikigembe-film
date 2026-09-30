import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { VerifyEmailComponent } from './verify-email.component';

describe('VerifyEmailComponent', () => {
  let fixture: ComponentFixture<VerifyEmailComponent>;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.removeItem('ikigembe_session');
    TestBed.configureTestingModule({
      imports: [VerifyEmailComponent],
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 'tok' }) } } },
      ],
    });
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(VerifyEmailComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    backend.verify();
    auth.logout();
    backend.match(`${environment.apiUrl}/auth/logout/`).forEach((r) => r.flush(null));
  });

  it('signs the user in and continues to their home', () => {
    const req = backend.expectOne(`${environment.apiUrl}/auth/verify-email/`);
    expect(req.request.body).toEqual({ token: 'tok' });
    req.flush({ access: 'access-1', user: { email: 'new@ikigembe.rw', role: 'Producer', onboarding_completed: false } });
    fixture.detectChanges();

    expect(auth.isLoggedIn()).toBeTrue();
    expect(auth.getAccessToken()).toBe('access-1');
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('auth.verifyEmail.successSignedInBody');

    const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
    el.querySelector<HTMLButtonElement>('button.submit-btn')!.click();
    expect(navigate).toHaveBeenCalledWith('/producer/onboarding', { replaceUrl: true });
  });

  it('shows the error state when the link is rejected', () => {
    backend.expectOne(`${environment.apiUrl}/auth/verify-email/`)
      .flush({ error: 'Invalid or expired verification token.' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(auth.isLoggedIn()).toBeFalse();
    expect(fixture.componentInstance.status()).toBe('error');
  });
});
