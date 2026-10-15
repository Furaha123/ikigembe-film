import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map } from 'rxjs';
import { AuthService, VERIFY_EMAIL_REQUIRED_URL } from '../../services/auth.service';

/**
 * On every page while the signed-in account's email address is unverified (AuthService.emailUnverified):
 * most features are refused by the API until the link is opened. Links to the verification prompt.
 */
@Component({
  selector: 'app-email-verification-banner',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <p class="verify-banner" role="status">
        <span>{{ 'auth.verifyRequired.banner' | translate }}</span>
        <a [routerLink]="promptUrl">{{ 'auth.verifyRequired.bannerLink' | translate }}</a>
      </p>
    }
  `,
  styles: [`
    .verify-banner {
      margin: 0; padding: 0.4rem 1rem; text-align: center; font-size: 0.85rem; line-height: 1.4;
      color: #fff; background: #7a1f1f; display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;
      position: relative; z-index: 60;
    }
    .verify-banner a { color: #ffd98a; text-decoration: underline; font-weight: 600; }
  `],
})
export class EmailVerificationBannerComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly promptUrl = VERIFY_EMAIL_REQUIRED_URL;

  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url },
  );

  readonly show = computed(() =>
    this.auth.isLoggedIn() && this.auth.emailUnverified() && !this.url().startsWith('/verify-email'));
}
