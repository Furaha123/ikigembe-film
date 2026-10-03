import { Component, Input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-viewing-access',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <section class="access-rules" [attr.aria-label]="'viewingAccess.title' | translate">
      <h3>{{ 'viewingAccess.title' | translate }}</h3>
      <span class="access-badge" [class.available]="hasAccess === true && !otherDevice" role="status">
        {{ (otherDevice ? 'viewingAccess.otherDevice' : hasAccess === true ? 'viewingAccess.oneRemaining' : hasAccess === false ? 'viewingAccess.noneRemaining' : 'viewingAccess.unknown') | translate }}
      </span>
      <ul>
        <li>{{ 'viewingAccess.singleView' | translate }}</li>
        <li>{{ 'viewingAccess.sameDevice' | translate }}</li>
        <li>{{ 'viewingAccess.usedView' | translate }}</li>
      </ul>
    </section>
  `,
  styles: [`
    :host { display: block; margin-bottom: 1.25rem; }
    .access-rules { padding: 1rem; border: 1px solid #66552c; border-radius: 10px; background: rgba(201, 168, 76, .07); color: #e5e5e5; }
    h3 { margin: 0 0 .65rem; font-size: 1rem; }
    .access-badge { display: inline-block; padding: .3rem .65rem; border: 1px solid #666; border-radius: 20px; font-size: .8rem; font-weight: 600; }
    .available { color: #e4ca83; border-color: #c9a84c; }
    ul { padding-left: 1.2rem; margin: .75rem 0 0; font-size: .85rem; line-height: 1.55; }
    li + li { margin-top: .35rem; }
  `],
})
export class ViewingAccessComponent {
  /** Server entitlement only; a cached purchase does not prove a view remains. */
  @Input() hasAccess: boolean | null = null;
  @Input() otherDevice = false;
}
