import { Type, signal } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import {
  AuthService, RESEND_COOLDOWN_SECONDS, RESEND_RATE_LIMITED_COOLDOWN_SECONDS, ResendVerificationResult,
} from '../../core/services/auth.service';
import { VerifyEmailComponent } from './verify-email.component';
import { RegisterComponent } from '../register/register.component';
import { RegisterProducerComponent } from '../register-producer/register-producer.component';

/** The three pages that offer "resend verification email", driven the same way. */
interface ResendPage {
  isResending(): boolean;
  resendSuccess(): boolean;
  resendError(): string | null;
  resendCooldown(): number;
}

type Setup = { name: string; type: Type<unknown>; trigger: (c: unknown) => void };

const PAGES: Setup[] = [
  {
    name: 'verify-email',
    type: VerifyEmailComponent,
    trigger: (c) => {
      const p = c as { resendEmail: { set(v: string): void }; requestNewLink(): void };
      p.resendEmail.set('user@example.com');
      p.requestNewLink();
    },
  },
  {
    name: 'register',
    type: RegisterComponent,
    trigger: (c) => {
      const p = c as { registeredEmail: { set(v: string): void }; resendEmail(): void };
      p.registeredEmail.set('user@example.com');
      p.resendEmail();
    },
  },
  {
    name: 'register-producer',
    type: RegisterProducerComponent,
    trigger: (c) => {
      const p = c as { form: { patchValue(v: object): void }; resendEmail(): void };
      p.form.patchValue({ email: 'user@example.com' });
      p.resendEmail();
    },
  },
];

describe('Resend verification — shared handling on all three pages', () => {
  for (const page of PAGES) {
    describe(page.name, () => {
      let fixture: ComponentFixture<unknown>;
      let auth: jasmine.SpyObj<AuthService>;

      const setup = (result: Observable<ResendVerificationResult>) => {
        auth = jasmine.createSpyObj<AuthService>('AuthService',
          ['requestVerificationEmail', 'resendVerification', 'verifyEmail', 'register', 'registerProducer', 'loginWithGoogle'],
          { isLoggedIn: signal(false) } as never);
        auth.requestVerificationEmail.and.returnValue(result);
        auth.verifyEmail.and.returnValue(of({}));
        TestBed.configureTestingModule({
          imports: [page.type],
          providers: [
            provideRouter([]),
            provideTranslateService(),
            { provide: AuthService, useValue: auth },
            { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}), paramMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) } },
          ],
        });
        fixture = TestBed.createComponent(page.type);
        return fixture.componentInstance as ResendPage;
      };

      it('uses AuthService.requestVerificationEmail (the shared helper)', fakeAsync(() => {
        const c = setup(of({ sent: true, message: null, cooldownSeconds: RESEND_COOLDOWN_SECONDS }));
        page.trigger(c);
        expect(auth.requestVerificationEmail).toHaveBeenCalledOnceWith('user@example.com');
        expect(auth.resendVerification).not.toHaveBeenCalled();
        expect(c.resendSuccess()).toBeTrue();
        expect(c.resendError()).toBeNull();
        expect(c.resendCooldown()).toBe(RESEND_COOLDOWN_SECONDS);
        discardPeriodicTasks();
      }));

      it('429 → translated message and the long cooldown', fakeAsync(() => {
        const c = setup(of({ sent: false, message: 'auth.common.resendTooMany', cooldownSeconds: RESEND_RATE_LIMITED_COOLDOWN_SECONDS }));
        page.trigger(c);
        expect(c.resendSuccess()).toBeFalse();
        expect(c.resendError()).toBe('auth.common.resendTooMany');
        expect(c.resendCooldown()).toBe(RESEND_RATE_LIMITED_COOLDOWN_SECONDS);
        expect(c.isResending()).toBeFalse();
        discardPeriodicTasks();
      }));

      it('other errors keep the page fallback and start no cooldown', fakeAsync(() => {
        const c = setup(of({ sent: false, message: null, cooldownSeconds: 0 }));
        page.trigger(c);
        expect(c.resendError()).toMatch(/resendFailed$/);
        expect(c.resendCooldown()).toBe(0);
        discardPeriodicTasks();
      }));
    });
  }
});
