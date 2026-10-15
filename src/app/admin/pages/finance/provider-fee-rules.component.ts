import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { apiErrorMessage, firstFieldError } from '../../../shared/utils/api-error';

export interface FeeRule {
  id: number;
  gateway: 'demo' | 'pawapay' | 'dpo';
  percent: string;
  fixed: number;
  returned_on_refund: boolean;
  effective_from: string;
  source_note: string;
  created_by: string | null;
  created_at: string;
}

const URL = `${environment.apiUrl}/admin/dashboard/finance/fee-rules/`;

/**
 * Provider fee rules (append-only history). Live gateways' rules give ESTIMATED fees; the demo rule is the
 * simulated provider's fee. A new rule applies to payments completed from its start; recorded fees never change.
 */
@Component({
  selector: 'app-provider-fee-rules',
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="refund-form" aria-labelledby="fee-rules-title">
      <h2 id="fee-rules-title">{{ 'admin.fees.rulesTitle' | translate }}</h2>
      <p class="muted">{{ 'admin.fees.rulesHint' | translate }}</p>
      @if (rounding()) { <p class="muted">{{ 'admin.fees.rounding' | translate: { rule: rounding() } }}</p> }

      <div aria-live="polite">
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        @if (saved()) { <p class="success" role="status">{{ 'admin.fees.ruleSaved' | translate }}</p> }
      </div>

      @if (rules().length === 0) {
        <p class="muted">{{ 'admin.fees.noRules' | translate }}</p>
      } @else {
        <div class="table-wrap">
          <table class="ledger">
            <thead><tr>
              <th scope="col">{{ 'admin.fees.gateway' | translate }}</th>
              <th scope="col" class="num">%</th>
              <th scope="col" class="num">{{ 'admin.fees.fixed' | translate }}</th>
              <th scope="col">{{ 'admin.fees.from' | translate }}</th>
              <th scope="col">{{ 'admin.fees.source' | translate }}</th>
            </tr></thead>
            <tbody>
              @for (r of rules(); track r.id) {
                <tr>
                  <td>{{ 'admin.fees.gatewayLabel.' + r.gateway | translate }}@if (r.returned_on_refund) { · {{ 'admin.fees.returnsOnRefund' | translate }} }</td>
                  <td class="num">{{ r.percent }}</td>
                  <td class="num">{{ r.fixed | number }}</td>
                  <td>{{ r.effective_from | date:'medium' }}</td>
                  <td class="muted">{{ r.source_note }}@if (r.created_by) { · {{ r.created_by }} }</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <form (ngSubmit)="save()" class="fee-rule-form">
        <label for="fr-gateway">{{ 'admin.fees.gateway' | translate }}</label>
        <select id="fr-gateway" name="gateway" [(ngModel)]="gateway">
          <option value="demo">{{ 'admin.fees.gatewayLabel.demo' | translate }}</option>
          <option value="pawapay">{{ 'admin.fees.gatewayLabel.pawapay' | translate }}</option>
          <option value="dpo">{{ 'admin.fees.gatewayLabel.dpo' | translate }}</option>
        </select>
        <label for="fr-percent">{{ 'admin.fees.percentLabel' | translate }}</label>
        <input id="fr-percent" name="percent" type="number" min="0" max="20" step="0.001" [(ngModel)]="percent" required />
        <label for="fr-fixed">{{ 'admin.fees.fixedLabel' | translate }}</label>
        <input id="fr-fixed" name="fixed" type="number" min="0" step="1" [(ngModel)]="fixed" required />
        @if (gateway === 'demo') {
          <label class="check"><input type="checkbox" name="returned" [(ngModel)]="returnedOnRefund" /> {{ 'admin.fees.returnsOnRefund' | translate }}</label>
        }
        <label for="fr-source">{{ 'admin.fees.sourceLabel' | translate }}</label>
        <input id="fr-source" name="source" type="text" maxlength="300" [(ngModel)]="sourceNote" required
               [placeholder]="'admin.fees.sourcePlaceholder' | translate" />
        <button type="submit" class="btn" [disabled]="busy()">{{ 'admin.fees.addRule' | translate }}</button>
      </form>
    </section>
  `,
  styles: [`.fee-rule-form { display: grid; gap: 0.4rem; max-width: 420px; margin-top: 1rem; }
            .check { display: flex; gap: 0.5rem; align-items: center; }`],
})
export class ProviderFeeRulesComponent implements OnInit {
  private readonly http = inject(HttpClient);

  rules = signal<FeeRule[]>([]);
  rounding = signal('');
  error = signal<string | null>(null);
  saved = signal(false);
  busy = signal(false);

  gateway: FeeRule['gateway'] = 'demo';
  percent = 0;
  fixed = 0;
  returnedOnRefund = false;
  sourceNote = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.http.get<{ results: FeeRule[]; rounding: string }>(URL).subscribe({
      next: ({ results, rounding }) => { this.rules.set(results); this.rounding.set(rounding); },
      error: (err: unknown) => this.error.set(apiErrorMessage(err) ?? 'Could not load the fee rules.'),
    });
  }

  save(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    this.http.post<FeeRule>(URL, {
      gateway: this.gateway, percent: String(this.percent), fixed: Math.round(this.fixed),
      returned_on_refund: this.gateway === 'demo' && this.returnedOnRefund, source_note: this.sourceNote.trim(),
    }).subscribe({
      next: () => { this.busy.set(false); this.saved.set(true); this.sourceNote = ''; this.load(); },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(firstFieldError(err) ?? apiErrorMessage(err) ?? 'Could not save the rule.');
      },
    });
  }
}
