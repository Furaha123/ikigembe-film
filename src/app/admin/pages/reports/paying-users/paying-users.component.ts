import {
  Component, inject, signal, OnInit, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { PayingUserItem, PayingUsersReport } from '../../../models/admin.interface';
import { DatePickerComponent, type DateRange } from '../../../../shared/components/date-picker/date-picker';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-paying-users',
  standalone: true,
  imports: [CommonModule, DatePickerComponent],
  templateUrl: './paying-users.component.html',
  styleUrl: './paying-users.component.scss',
})
export class PayingUsersComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);

  dateFrom = signal<string>(this.defaultFrom());
  dateTo   = signal<string>(new Date().toISOString().slice(0, 10));

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
    if (range.start) this.dateFrom.set(range.start.toISOString().slice(0, 10));
    if (range.end)   this.dateTo.set(range.end.toISOString().slice(0, 10));
    if (range.start && range.end) { this.page.set(1); this.load(); }
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
      ['PAYING USERS REPORT'],
      [`Generated: ${dateLabel}`],
      [`Total paying users: ${this.totalUsers()}`],
      [],
      ['Name', 'Email', 'Phone', 'Payments', 'Total Paid (RWF)', 'First Payment', 'Last Payment'],
      ...this.users().map(u => [
        u.name, u.email ?? '', u.phone_number ?? '',
        u.payment_count, u.total_paid_rwf,
        u.first_payment_date ?? '', u.last_payment_date ?? '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Paying Users');
    XLSX.writeFile(wb, `paying_users_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
