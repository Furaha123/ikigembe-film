import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { apiErrorMessage } from '../../../shared/utils/api-error';

interface StatementRow {
  id: number;
  period: string;
  gross: number;
  amount: number;
  payout_status: 'unpaid' | 'paid';
  payout_reference: string | null;
  paid_at: string | null;
}

interface StatementDetail extends StatementRow {
  films: { movie_id: number; movie__title: string; rule: string; basis: number; amount: number }[];
}

const BASE = `${environment.apiUrl}/producer/statements`;

/** Closed monthly statements (the API returns only this producer's own). */
@Component({
  selector: 'app-producer-statements',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './producer-statements.component.html',
  styleUrl: '../../../admin/pages/payments/admin-payments.component.scss',
})
export class ProducerStatementsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  rows = signal<StatementRow[]>([]);
  detail = signal<StatementDetail | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.http.get<{ results: StatementRow[] }>(`${BASE}/`).subscribe({
      next: ({ results }) => { this.rows.set(results); this.loading.set(false); },
      error: (err: unknown) => { this.loading.set(false); this.error.set(apiErrorMessage(err) ?? 'producerUi.statements.loadFailed'); },
    });
  }

  open(row: StatementRow): void {
    this.http.get<StatementDetail>(`${BASE}/${row.id}/`).subscribe({
      next: (d) => this.detail.set(d),
      error: (err: unknown) => this.error.set(apiErrorMessage(err) ?? 'producerUi.statements.loadFailed'),
    });
  }
}
