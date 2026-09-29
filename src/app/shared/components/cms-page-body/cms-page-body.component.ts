import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Renders a CMS page exactly as the public site shows it (also used for the
 * admin preview). The HTML body is bound with [innerHTML], so Angular's
 * DomSanitizer strips scripts and event handlers — never bypass it here.
 */
@Component({
  selector: 'app-cms-page-body',
  standalone: true,
  imports: [DatePipe, TranslatePipe],
  template: `
    <article class="cms-article">
      <header class="cms-header">
        <h1>{{ title }}</h1>
        @if (updatedAt) {
          <p class="cms-updated">{{ 'cms.lastUpdated' | translate }} {{ updatedAt | date:'longDate' }}</p>
        }
      </header>
      <div class="cms-body" [innerHTML]="body"></div>
    </article>
  `,
  styleUrls: ['./cms-page-body.component.scss'],
})
export class CmsPageBodyComponent {
  @Input({ required: true }) title = '';
  @Input() body = '';
  @Input() updatedAt: string | null = null;
}
