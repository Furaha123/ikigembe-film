import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import { apiErrorMessage } from '../../../shared/utils/api-error';

export type TranscodeState = 'queued' | 'processing' | 'succeeded' | 'failed';

export interface TranscodeJob {
  movie_id: number;
  title: string;
  state: TranscodeState;
  attempts: number;
  max_attempts: number;
  /** Failed and out of automatic attempts: needs an admin. */
  terminal: boolean;
  retryable: boolean;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  approval_status: string;
}

interface TranscodePage {
  counts: Record<TranscodeState | 'terminal', number>;
  page: number;
  total_pages: number;
  total_results: number;
  results: TranscodeJob[];
}

const BASE = `${environment.apiUrl}/admin/dashboard/transcodes`;

/** Transcode health: job states, attempts, safe error text and a guarded retry (server-side de-duplicated). */
@Component({
  selector: 'app-admin-transcodes',
  standalone: true,
  imports: [CommonModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-transcodes.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminTranscodesComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);

  readonly states: (TranscodeState | '')[] = ['', 'failed', 'processing', 'queued', 'succeeded'];
  state = signal<TranscodeState | ''>('failed');
  page = signal(1);
  data = signal<TranscodePage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  retrying = signal<number | null>(null);
  notice = signal<string | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.load();
    // Processing jobs change on their own; refresh quietly while the page is open.
    this.timer = setInterval(() => this.load(true), 15000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  setState(state: TranscodeState | ''): void {
    this.state.set(state);
    this.page.set(1);
    this.load();
  }

  load(quiet = false): void {
    if (!quiet) this.loading.set(true);
    let params = new HttpParams().set('page', this.page());
    if (this.state()) params = params.set('state', this.state());
    this.http.get<TranscodePage>(`${BASE}/`, { params }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); this.error.set(null); },
      error: (err: unknown) => {
        this.loading.set(false);
        if (!quiet) this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.transcodes.loadFailed'));
      },
    });
  }

  go(page: number): void {
    this.page.set(page);
    this.load();
  }

  retry(job: TranscodeJob): void {
    if (this.retrying()) return;
    this.retrying.set(job.movie_id);
    this.notice.set(null);
    this.http.post<TranscodeJob>(`${BASE}/${job.movie_id}/retry/`, {}).subscribe({
      next: () => {
        this.retrying.set(null);
        this.notice.set(this.translate.instant('admin.transcodes.restarted', { title: job.title }));
        this.load(true);
      },
      error: (err: unknown) => {
        this.retrying.set(null);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.transcodes.retryFailed'));
        this.load(true);
      },
    });
  }
}
