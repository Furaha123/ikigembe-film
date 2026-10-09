import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminPaymentsService, AuditFilters, AuditPage } from '../../services/admin-payments.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';

/** Read-only audit trail with server-side filters and pagination (filter state in the URL). */
@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './admin-audit-log.component.html',
  styleUrl: '../payments/admin-payments.component.scss',
})
export class AdminAuditLogComponent implements OnInit {
  private readonly api = inject(AdminPaymentsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  filters: AuditFilters = {};
  data = signal<AuditPage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  expanded = signal<number | null>(null);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const page = Number(params.get('page'));
      this.filters = {
        action: params.get('action') ?? '',
        actor: params.get('actor') ?? '',
        target: params.get('target') ?? '',
        resource: params.get('resource') ?? '',
        date_from: params.get('date_from') ?? '',
        date_to: params.get('date_to') ?? '',
        page: Number.isInteger(page) && page > 0 ? page : 1,
      };
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.auditLog({ ...this.filters, page_size: 25 }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('admin.audit.loadFailed'));
      },
    });
  }

  search(page = 1): void {
    const queryParams: Record<string, string | null> = {};
    for (const [k, v] of Object.entries({ ...this.filters, page })) {
      queryParams[k] = v === '' || v === undefined || (k === 'page' && v === 1) ? null : String(v);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  reset(): void {
    this.filters = {};
    this.search();
  }

  toggle(id: number): void {
    this.expanded.update(current => current === id ? null : id);
  }

  json(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }
}
