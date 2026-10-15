import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { PaymentService } from '../../services/payment.service';

/**
 * Shown on every page while the server runs in demo mode (`/payments/config/` → `demo`): payments are
 * simulated and no money moves. Renders nothing otherwise (and on the server, the config call falls back
 * to "not demo").
 */
@Component({
  selector: 'app-demo-banner',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo()) {
      <p class="demo-banner" role="note">
        <strong>{{ 'demoBanner.label' | translate }}</strong>
        <span>{{ 'demoBanner.text' | translate }}</span>
      </p>
    }
  `,
  styles: [`
    .demo-banner {
      margin: 0; padding: 0.35rem 1rem; text-align: center; font-size: 0.8rem; line-height: 1.4;
      color: #1b1300; background: #f5c518; display: flex; gap: 0.4rem; justify-content: center; flex-wrap: wrap;
      position: relative; z-index: 60;
    }
    .demo-banner strong { letter-spacing: 0.02em; }
  `],
})
export class DemoBannerComponent {
  readonly demo = toSignal(inject(PaymentService).getConfig().pipe(map(c => !!c.demo)), { initialValue: false });
}
