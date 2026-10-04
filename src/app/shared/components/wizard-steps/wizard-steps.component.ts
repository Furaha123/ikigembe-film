import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Progress indicator for the marketplace wizards (apply, talent video, access,
 * post casting). Purely visual: each wizard owns its own step state.
 */
@Component({
  selector: 'app-wizard-steps',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <ol class="wz-steps" [attr.aria-label]="'marketplace.wizard.progress' | translate">
      @for (label of steps(); track label; let i = $index) {
        <li [class.done]="i < current()" [class.current]="i === current()"
            [attr.aria-current]="i === current() ? 'step' : null">
          <span class="wz-dot" aria-hidden="true">{{ i < current() ? '✓' : i + 1 }}</span>
          <span class="wz-label">{{ label | translate }}</span>
        </li>
      }
    </ol>
    <p class="wz-count">{{ 'marketplace.wizard.stepOf' | translate: { n: current() + 1, total: steps().length } }}</p>
  `,
  styles: [`
    :host { display: block; margin-bottom: 1.25rem; }
    .wz-steps { list-style: none; display: flex; gap: .5rem; margin: 0; padding: 0; overflow: hidden; }
    li { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: .45rem; color: #b3b3b3; font-size: .8rem; }
    li::after { content: ''; flex: 1; height: 2px; background: #4a4a4a; border-radius: 2px; }
    li:last-child::after { display: none; }
    li.done::after { background: #c5a253; }
    .wz-dot {
      flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center;
      border: 1px solid #4a4a4a; font-weight: 700; font-size: .8rem; color: #e5e5e5;
    }
    li.current .wz-dot { border-color: #c5a253; color: #c5a253; }
    li.done .wz-dot { background: #c5a253; border-color: #c5a253; color: #111; }
    li.current { color: #fff; }
    .wz-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wz-count { margin: .5rem 0 0; color: #b3b3b3; font-size: .8rem; }
    @media (max-width: 640px) {
      li:not(.current) .wz-label { display: none; }
      li.current { flex: 2 1 auto; }
    }
  `],
})
export class WizardStepsComponent {
  /** Translation keys, one per step. */
  readonly steps = input.required<readonly string[]>();
  /** Zero-based index of the current step. */
  readonly current = input.required<number>();
}
