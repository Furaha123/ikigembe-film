import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';

/** Catch-all for unknown URLs (previously a blank screen with an uncaught NG04002). */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TranslatePipe, HeaderComponent, FooterComponent],
  template: `
    <app-header [userImg]="''" />
    <main class="nf">
      <p class="nf__code" aria-hidden="true">404</p>
      <h1 class="nf__title">{{ 'notFound.title' | translate }}</h1>
      <p class="nf__text">{{ 'notFound.text' | translate }}</p>
      <div class="nf__actions">
        <a class="nf__btn nf__btn--primary" [routerLink]="auth.isLoggedIn() ? auth.homeUrl() : '/login'">
          {{ (auth.isLoggedIn() ? 'notFound.home' : 'notFound.signIn') | translate }}
        </a>
        <a class="nf__btn" routerLink="/producers">{{ 'notFound.producers' | translate }}</a>
      </div>
    </main>
    <app-footer />
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--ik-bg); }
    .nf { max-width: 560px; margin: 0 auto; padding: 140px 16px 96px; text-align: center; }
    .nf__code { font-size: 72px; font-weight: 800; line-height: 1; color: var(--ik-gold); letter-spacing: 2px; }
    .nf__title { margin-top: 16px; font-size: 28px; font-weight: 700; }
    .nf__text { margin-top: 12px; color: var(--ik-text-muted); line-height: 1.6; }
    .nf__actions { margin-top: 28px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .nf__btn {
      display: inline-flex; align-items: center; min-height: 44px; padding: 0 22px; border-radius: 6px;
      border: 1px solid var(--ik-border-strong); font-weight: 600; color: var(--ik-text);
    }
    .nf__btn--primary { background: var(--ik-gold); border-color: var(--ik-gold); color: var(--ik-on-gold); }
  `],
})
export class NotFoundComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly seo = inject(SeoService);

  ngOnInit() {
    this.seo.setTranslated({ titleKey: 'notFound.title', noIndex: true });
  }
}
