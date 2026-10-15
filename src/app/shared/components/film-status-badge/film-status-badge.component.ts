import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatKigali, LifecycleStatus, lifecycleBadgeClass, lifecycleLabelKey } from '../../utils/film-status';

/** Film lifecycle badge (Draft, In review, Scheduled — with the Kigali release time, Published, …). */
@Component({
  selector: 'app-film-status-badge',
  imports: [TranslatePipe],
  template: `
    <span [class]="badgeClass()" [attr.title]="scheduledAt() ? ('filmStatus.kigaliTime' | translate: { date: scheduledAt() }) : null">
      {{ labelKey() | translate }}
      @if (scheduledAt()) {
        <span class="film-status__when">· {{ 'filmStatus.kigaliTime' | translate: { date: scheduledAt() } }}</span>
      }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .film-status {
      display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px;
      font-size: 12px; font-weight: 600; line-height: 1.4; white-space: nowrap;
      background: rgba(255,255,255,.08); color: #e5e7eb;
    }
    .film-status__when { font-weight: 500; opacity: .9; }
    .film-status--draft             { background: rgba(148,163,184,.15); color: #cbd5e1; }
    .film-status--in_review         { background: #2a2316; color: #fde68a; }
    .film-status--awaiting_contract { background: rgba(245,158,11,.1); color: #f59e0b; }
    .film-status--changes_requested { background: rgba(245,158,11,.12); color: #f59e0b; border: 1px solid rgba(245,158,11,.25); }
    .film-status--rejected          { background: #2e1a1a; color: #fca5a5; }
    .film-status--unpublished       { background: rgba(148,163,184,.12); color: #94a3b8; border: 1px solid rgba(148,163,184,.25); }
    .film-status--scheduled         { background: rgba(59,130,246,.12); color: #93c5fd; }
    .film-status--published         { background: #1a2c21; color: #86efac; }
  `],
})
export class FilmStatusBadgeComponent {
  readonly status = input<LifecycleStatus | string | null | undefined>(null);
  /** Shown (in Kigali time) for scheduled films. */
  readonly releaseAt = input<string | null | undefined>(null);

  readonly labelKey = computed(() => lifecycleLabelKey(this.status()));
  readonly badgeClass = computed(() => lifecycleBadgeClass(this.status()));
  readonly scheduledAt = computed(() => this.status() === 'scheduled' ? formatKigali(this.releaseAt()) : '');
}
