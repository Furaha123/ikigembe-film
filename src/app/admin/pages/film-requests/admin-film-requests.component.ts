import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { FilmChangeRequest } from '../../../producer/services/producer.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type Row = FilmChangeRequest & { current: Record<string, string> };
const BASE = `${environment.apiUrl}/admin/dashboard/film-requests`;

/** Producers' change / unpublish requests for approved films: review, then approve (applies it) or reject. */
@Component({
  selector: 'app-admin-film-requests',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-film-requests.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminFilmRequestsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  readonly states = ['pending', 'approved', 'rejected', 'cancelled'] as const;
  state = signal<(typeof this.states)[number]>('pending');
  rows = signal<Row[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal<number | null>(null);
  rejecting = signal<number | null>(null);
  reason = '';

  ngOnInit(): void {
    this.load();
  }

  setState(s: (typeof this.states)[number]): void {
    this.state.set(s);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<{ results: Row[] }>(`${BASE}/`, { params: new HttpParams().set('status', this.state()) }).subscribe({
      next: (r) => { this.rows.set(r.results); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.filmRequests.loadFailed'));
      },
    });
  }

  approve(row: Row): void {
    this.decide(row, 'approve', {});
  }

  reject(row: Row): void {
    if (!this.reason.trim()) { this.error.set(this.translate.instant('admin.payments.reasonRequired')); return; }
    this.decide(row, 'reject', { reason: this.reason.trim() });
  }

  changedFields(row: Row): string[] {
    return Object.keys(row.changes);
  }

  /** The proposed value of one changed field, as text. */
  proposed(row: Row, field: string): string {
    const value = (row.changes as Record<string, unknown>)[field];
    return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }

  private decide(row: Row, action: 'approve' | 'reject', body: object): void {
    if (this.busy()) return;
    this.busy.set(row.id);
    this.error.set(null);
    this.http.post(`${BASE}/${row.id}/${action}/`, body).subscribe({
      next: () => {
        this.busy.set(null);
        this.rejecting.set(null);
        this.reason = '';
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(null);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.payments.actionFailed'));
      },
    });
  }
}
