import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Sub-navigation shared by the viewer-side marketplace pages. */
@Component({
  selector: 'app-actor-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
  template: `
    <nav class="mk-tabs" [attr.aria-label]="'marketplace.nav.label' | translate">
      <a routerLink="/casting" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">{{ 'marketplace.nav.casting' | translate }}</a>
      <a routerLink="/actor/applications" routerLinkActive="active">{{ 'marketplace.nav.applications' | translate }}</a>
      <a routerLink="/actor/videos" routerLinkActive="active">{{ 'marketplace.nav.videos' | translate }}</a>
      <a routerLink="/actor/profile" routerLinkActive="active">{{ 'marketplace.nav.profile' | translate }}</a>
    </nav>
  `,
})
export class ActorNavComponent {}
