import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminService } from '../../../services/admin.service';
import { PayingUserItem, PayingUsersReport } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import * as XLSX from 'xlsx';
import { toLocalDateString } from '../../../../shared/utils/local-date';

@Component({
  selector: 'app-paying-users',
  standalone: true,
  imports: [CommonModule, DatePickerComponent, TranslatePipe],
  templateUrl: './paying-users.component.html',
  styleUrl: './paying-users.component.scss',
})
export class PayingUsersComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly translate    = inject(TranslateService);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(toLocalDateString(new Date()));

  users      = signal<PayingUserItem[]>([]);
  isLoading  = signal(true);
  hasError   = signal(false);
  page       = signal(1);
  totalPages = signal(1);
  totalUsers = signal(0);
  expandedId = signal<number | null>(null);

  private sub: Subscription | null = null;

  ngOnInit(): void { this.load(); }

  onDateRangeChange(range: DateRange): void {
    if (range.start) this.dateFrom.set(toLocalDateString(range.start));
    if (range.end)   this.dateTo.set(toLocalDateString(range.end));
    if (range.start && range.end) { this.page.set(1); this.load(); }
  }

  setDateRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    this.page.set(1);
    this.load();
  }

  load(): void {
    this.sub?.unsubscribe();
    this.isLoading.set(true);
    this.hasError.set(false);
    this.sub = this.adminService.getPayingUsers(
      this.page(),
      this.dateFrom() || undefined,
      this.dateTo()   || undefined,
    ).subscribe({
      next: (data: PayingUsersReport) => {
        this.users.set(data.results ?? []);
        this.totalPages.set(data.total_pages ?? 1);
        this.totalUsers.set(data.total_paying_users ?? 0);
        this.isLoading.set(false);
      },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.page.set(p);
    this.load();
  }

  toggleExpand(id: number): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  pages(): number[] {
    const total = this.totalPages(), cur = this.page(), delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, cur - delta); i <= Math.min(total, cur + delta); i++) range.push(i);
    return range;
  }

  export(): void {
    const wb = XLSX.utils.book_new();
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const rows: (string | number | null)[][] = [
      [this.translate.instant('admin.reports.payingUsers.exportTitle')],
      [this.translate.instant('admin.reports.generated', { date: dateLabel })],
      [this.translate.instant('admin.reports.payingUsers.exportTotal', { count: this.totalUsers() })],
      [],
      [this.translate.instant('admin.reports.payingUsers.colName'), this.translate.instant('admin.reports.payingUsers.colEmail'), this.translate.instant('admin.reports.payingUsers.colPhone'), this.translate.instant('admin.reports.payingUsers.colMovieTitle'), this.translate.instant('admin.reports.payingUsers.colAmountRwf'), this.translate.instant('admin.reports.payingUsers.colStatus'), this.translate.instant('admin.reports.payingUsers.colPaidAt')],
      ...this.users().flatMap(u =>
        u.payments.length
          ? u.payments.map(p => [
              u.name, u.email ?? '', u.phone_number ?? '',
              p.movie_title, p.amount, p.status,
              p.paid_at ? new Date(p.paid_at).toLocaleString('en-GB') : '',
            ])
          : [[u.name, u.email ?? '', u.phone_number ?? '', '', '', '', '']],
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws, this.translate.instant('admin.reports.payingUsers.sheetName'));
    XLSX.writeFile(wb, `paying_users_${toLocalDateString(new Date())}.xlsx`);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return toLocalDateString(d);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
