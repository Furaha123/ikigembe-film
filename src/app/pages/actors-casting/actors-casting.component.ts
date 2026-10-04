import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { AuthService } from '../../core/services/auth.service';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';
import { marketplaceFeature } from '../../core/access/marketplace-access';
import { RETURN_URL_PARAM } from '../../shared/utils/safe-redirect';

/**
 * Entry to the casting marketplace: browse announcements, or show your talent.
 * Public and request-free; the chosen page's guards handle sign-in and roles.
 * Choosing a path never changes the account's role.
 */
@Component({
  selector: 'app-actors-casting',
  standalone: true,
  imports: [RouterLink, TranslatePipe, HeaderComponent, FooterComponent],
  styleUrls: ['../../shared/styles/marketplace-page.scss'],
  template: `
    <app-header [userImg]="''" />

    <main class="mk-page">
      <div class="mk-header">
        <div>
          <h1>{{ 'marketplace.hub.title' | translate }}</h1>
          <p>{{ 'marketplace.hub.subtitle' | translate }}</p>
        </div>
      </div>

      @if (access.inactiveNotice(); as notice) {
        <p class="mk-banner" role="status">{{ 'marketplace.access.' + notice | translate }}</p>
      }

      <div class="mk-choices">
        @if (showActorPaths()) {
          <article class="mk-choice">
            <h2>{{ 'marketplace.hub.browseTitle' | translate }}</h2>
            <p>{{ 'marketplace.hub.browseText' | translate }}</p>
            <a routerLink="/casting" class="mk-btn">{{ 'marketplace.hub.browseAction' | translate }}</a>
          </article>

          <article class="mk-choice">
            <h2>{{ 'marketplace.hub.talentTitle' | translate }}</h2>
            <p>{{ 'marketplace.hub.talentText' | translate }}</p>
            @if (signedIn() && !access.can('submit-talent')) {
              <p class="mk-muted">{{ 'marketplace.hub.talentViewersOnly' | translate }}</p>
            } @else {
              <a [routerLink]="talentRoute" class="mk-btn">{{ 'marketplace.hub.talentAction' | translate }}</a>
            }
          </article>
        }

        <article class="mk-choice">
          <h2>{{ 'marketplace.hub.producerTitle' | translate }}</h2>
          <p>{{ 'marketplace.hub.producerText' | translate }}</p>
          @if (access.can('post-casting')) {
            <div class="mk-row">
              <a routerLink="/producer/casting/new" class="mk-btn">{{ 'marketplace.nav.postCasting' | translate }}</a>
              <a routerLink="/producer/actors" class="mk-btn mk-btn--ghost">{{ 'marketplace.nav.findActors' | translate }}</a>
            </div>
          } @else if (access.can('moderation')) {
            <a routerLink="/admin/marketplace" class="mk-btn">{{ 'admin.nav.marketplace' | translate }}</a>
          } @else if (signedIn()) {
            <p class="mk-muted">{{ 'marketplace.hub.producerUpgrade' | translate }}</p>
            @if (isViewer()) {
              <a routerLink="/profile" class="mk-btn mk-btn--ghost">{{ 'header.becomeProducer' | translate }}</a>
            }
          } @else {
            <a routerLink="/login" [queryParams]="signInParams" class="mk-btn mk-btn--ghost">{{ 'marketplace.hub.signIn' | translate }}</a>
          }
        </article>
      </div>
    </main>

    <app-footer />
  `,
})
export class ActorsCastingComponent {
  private readonly auth = inject(AuthService);
  readonly access = inject(MarketplaceAccessService);

  readonly talentRoute = marketplaceFeature('submit-talent').route!;
  readonly signInParams = { [RETURN_URL_PARAM]: '/actors-casting' };
  readonly signedIn = this.auth.isLoggedIn;
  readonly isViewer = computed(() => this.access.user()?.role === 'Viewer');
  /** Guests see every path (sign-in comes next); admins only moderate. */
  readonly showActorPaths = computed(() => !this.signedIn() || this.access.can('casting-calls'));
}
