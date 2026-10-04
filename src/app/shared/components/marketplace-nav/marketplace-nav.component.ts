import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { MarketplaceAccessService } from '../../../core/access/marketplace-access.service';

/**
 * Marketplace tabs for the signed-in account, from the access map: viewers see
 * the actor tabs, producers theirs, admins none. Accounts that aren't active get
 * a notice instead of tabs that would all fail.
 */
@Component({
  selector: 'app-marketplace-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  styleUrls: ['../../styles/marketplace-page.scss'],
  template: `
    @if (access.inactiveNotice(); as notice) {
      <p class="mk-banner" role="status">{{ 'marketplace.access.' + notice | translate }}</p>
    }
    @if (access.tabs().length) {
      <nav class="mk-tabs" [attr.aria-label]="'marketplace.nav.label' | translate">
        @for (tab of access.tabs(); track tab.key) {
          <a [routerLink]="tab.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!tab.exact }" ariaCurrentWhenActive="page">{{ tab.labelKey | translate }}</a>
        }
      </nav>
    }
  `,
})
export class MarketplaceNavComponent {
  readonly access = inject(MarketplaceAccessService);
}
