import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Tabs shared by the admin CMS screens. */
@Component({
  selector: 'app-cms-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  styleUrls: ['../movies/admin-movies.component.scss'],
  template: `
    <nav class="tabs" [attr.aria-label]="'admin.cms.title' | translate">
      <a class="tab" routerLink="/admin/cms/pages" routerLinkActive="active">{{ 'admin.cms.tabPages' | translate }}</a>
      <a class="tab" routerLink="/admin/cms/ads" routerLinkActive="active">{{ 'admin.cms.tabAds' | translate }}</a>
    </nav>
  `,
})
export class CmsTabsComponent {}
