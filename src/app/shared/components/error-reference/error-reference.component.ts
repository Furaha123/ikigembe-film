import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { apiErrorReference } from '../../utils/api-error';

/**
 * "Reference: <id>" under an error message, so a user can quote it to support and staff can find the
 * request in the API logs. Give it the error (`[error]`) or an id already read with `apiErrorReference()`
 * (`[reference]`); renders nothing when there is none.
 */
@Component({
  selector: 'app-error-reference',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (id(); as ref) {
      <p class="error-reference">{{ 'support.reference' | translate }} <code>{{ ref }}</code></p>
    }
  `,
  styles: [`
    .error-reference { margin: .35rem 0 0; font-size: .75rem; color: #9a9a9a; }
    code { font-family: monospace; user-select: all; color: inherit; }
  `],
})
export class ErrorReferenceComponent {
  readonly error = input<unknown>(null);
  readonly reference = input<string | null>(null);

  readonly id = computed(() => this.reference() ?? apiErrorReference(this.error()));
}
