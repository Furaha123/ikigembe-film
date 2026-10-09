import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

export interface AdminSectionTab {
  labelKey: string;
  path: string;
  /** When true, only the exact path matches (default: prefix match). */
  exact?: boolean;
  badge?: number;
}

/**
 * Horizontal tab bar used by consolidated admin sections.
 * Placed at the top of each page that shares a sidebar nav entry.
 */
@Component({
  selector: 'app-admin-section-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <nav class="ast-bar" [attr.aria-label]="ariaLabel | translate">
      @for (tab of tabs; track tab.path) {
        <a class="ast-tab"
           [routerLink]="tab.path"
           routerLinkActive="ast-tab--active"
           [routerLinkActiveOptions]="{ exact: !!tab.exact }">
          {{ tab.labelKey | translate }}
          @if (tab.badge) {
            <span class="ast-badge">{{ tab.badge }}</span>
          }
        </a>
      }
    </nav>
  `,
  styles: [`
    $gold:   #C5A253;
    $border: #2a2a2a;
    $muted:  #777;
    $surface: #141414;

    .ast-bar {
      display: flex;
      align-items: center;
      gap: 0;
      border-bottom: 1px solid $border;
      margin-bottom: 1.5rem;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }

    .ast-tab {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.6rem 1rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: $muted;
      text-decoration: none;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      transition: color 0.15s, border-color 0.15s;

      &:hover { color: #e0e0e0; }

      &.ast-tab--active {
        color: #fff;
        border-bottom-color: $gold;
        font-weight: 600;
      }

      &:focus-visible {
        outline: 2px solid $gold;
        outline-offset: -2px;
      }
    }

    .ast-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 9px;
      background: #ef4444;
      color: #fff;
      font-size: 0.62rem;
      font-weight: 700;
      line-height: 1;
    }
  `],
})
export class AdminSectionTabsComponent {
  @Input() tabs: AdminSectionTab[] = [];
  @Input() ariaLabel = 'admin.layout.sectionTabs';
}
