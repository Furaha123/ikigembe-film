import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { safeReturnUrl } from './safe-redirect';
import { authGuard } from '../../core/guards/auth.guard';
import { AuthService } from '../../core/services/auth.service';

describe('safeReturnUrl', () => {
  it('accepts in-app paths, with query strings', () => {
    expect(safeReturnUrl('/movie/12')).toBe('/movie/12');
    expect(safeReturnUrl('/casting/3?tab=roles')).toBe('/casting/3?tab=roles');
  });

  it('rejects anything that could leave the site', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'movie/12', '/%0d/x\r', '']) {
      expect(safeReturnUrl(bad)).withContext(bad).toBeNull();
    }
    expect(safeReturnUrl(null)).toBeNull();
    expect(safeReturnUrl(undefined)).toBeNull();
  });

  it('rejects the auth pages (they would loop back to sign-in)', () => {
    expect(safeReturnUrl('/login')).toBeNull();
    expect(safeReturnUrl('/register?returnUrl=/x')).toBeNull();
    expect(safeReturnUrl('/reset-password?token=t')).toBeNull();
    expect(safeReturnUrl('/loginhelp')).toBe('/loginhelp'); // only exact auth routes
  });
});

describe('authGuard + AuthService.postLoginUrl', () => {
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('sends a signed-out visitor to /login with the page they asked for', () => {
    spyOn(auth, 'isLoggedIn').and.returnValue(false);
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url: '/movie/12' } as RouterStateSnapshot)) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Fmovie%2F12');
  });

  it('returns to a safe requested page after sign-in, else the role home', () => {
    spyOn(auth, 'homeUrl').and.returnValue('/browse');
    expect(auth.postLoginUrl('/movie/12')).toBe('/movie/12');
    expect(auth.postLoginUrl('//evil.example')).toBe('/browse');
    expect(auth.postLoginUrl(null)).toBe('/browse');
  });

  it('producer onboarding still comes first', () => {
    spyOn(auth, 'homeUrl').and.returnValue('/producer/onboarding');
    expect(auth.postLoginUrl('/movie/12')).toBe('/producer/onboarding');
  });
});
