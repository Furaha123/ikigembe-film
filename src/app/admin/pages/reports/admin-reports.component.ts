import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RevenueTrendComponent }      from './revenue-trend/revenue-trend.component';
import { TopMoviesComponent }         from './top-movies/top-movies.component';
import { UserGrowthComponent }        from './user-growth/user-growth.component';
import { WithdrawalSummaryComponent } from './withdrawal-summary/withdrawal-summary.component';
import { PayingUsersComponent }       from './paying-users/paying-users.component';
import { DatePickerComponent, type DateRange } from '../../../shared/components/date-picker/date-picker';

type ReportKey    = 'revenue' | 'movies' | 'users' | 'withdrawals' | 'paying';
type RangePreset  = '7D' | '14D' | '28D' | '1M' | '3M' | '6M' | '1Y';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [
    CommonModule,
    RevenueTrendComponent,
    TopMoviesComponent,
    UserGrowthComponent,
    WithdrawalSummaryComponent,
    PayingUsersComponent,
    DatePickerComponent,
  ],
  templateUrl: './admin-reports.component.html',
  styleUrl: './admin-reports.component.scss',
})
export class AdminReportsComponent {
  @ViewChild(RevenueTrendComponent)      private revenueTrendRef!: RevenueTrendComponent;
  @ViewChild(TopMoviesComponent)         private topMoviesRef!: TopMoviesComponent;
  @ViewChild(UserGrowthComponent)        private userGrowthRef!: UserGrowthComponent;
  @ViewChild(WithdrawalSummaryComponent) private withdrawalRef!: WithdrawalSummaryComponent;
  @ViewChild(PayingUsersComponent)       private payingRef!: PayingUsersComponent;

  activeReport  = signal<ReportKey>('revenue');
  showChart     = signal(true);
  sidebarOpen   = signal(true);
  selectedRange = signal<RangePreset | 'custom'>('1Y');
  dateFrom      = signal<string>(this.defaultFrom());
  dateTo        = signal<string>(new Date().toISOString().slice(0, 10));

  readonly rangePresets: RangePreset[] = ['7D', '14D', '28D', '1M', '3M', '6M', '1Y'];

  readonly reports: { key: ReportKey; label: string; sub: string; color: string }[] = [
    { key: 'revenue',     label: 'Revenue Trend',      sub: 'Monthly platform breakdown',  color: '#C8A84B' },
    { key: 'movies',      label: 'Top Movies',         sub: 'Best performing content',     color: '#2dd4bf' },
    { key: 'users',       label: 'User Growth',        sub: 'Registrations & activity',    color: '#60a5fa' },
    { key: 'withdrawals', label: 'Withdrawal Summary', sub: 'Payout status by month',      color: '#34d399' },
    { key: 'paying',      label: 'Paying Users',       sub: 'Users with purchases',        color: '#818cf8' },
  ];

  readonly adminExtras: Record<ReportKey, string[]> = {
    revenue:     ['Platform commission (30%)', 'Producer share (70%)', 'Total purchase count'],
    movies:      ['Commission per movie', 'Revenue per view', 'Unique viewers'],
    users:       ['All producers platform-wide', 'Cross-producer paying users', 'Active user count'],
    withdrawals: ['Completed vs pending vs rejected', 'Monthly request volume'],
    paying:      ['All users across platform', 'Per-user payment history', 'Contact info (email, phone)'],
  };

  get active() {
    return this.reports.find(r => r.key === this.activeReport())!;
  }

  setReport(key: ReportKey): void {
    this.activeReport.set(key);
    setTimeout(() => this.propagateDates(), 0);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  toggleChart(): void {
    this.showChart.update(v => !v);
  }

  setRange(r: RangePreset): void {
    this.selectedRange.set(r);
    const to   = new Date();
    const from = new Date();
    switch (r) {
      case '7D':  from.setDate(from.getDate() - 7);          break;
      case '14D': from.setDate(from.getDate() - 14);         break;
      case '28D': from.setDate(from.getDate() - 28);         break;
      case '1M':  from.setMonth(from.getMonth() - 1);        break;
      case '3M':  from.setMonth(from.getMonth() - 3);        break;
      case '6M':  from.setMonth(from.getMonth() - 6);        break;
      case '1Y':  from.setFullYear(from.getFullYear() - 1);  break;
    }
    this.dateFrom.set(from.toISOString().slice(0, 10));
    this.dateTo.set(to.toISOString().slice(0, 10));
    this.propagateDates();
  }

  onDateChange(range: DateRange): void {
    if (range.start) this.dateFrom.set(range.start.toISOString().slice(0, 10));
    if (range.end)   this.dateTo.set(range.end.toISOString().slice(0, 10));
    if (range.start && range.end) {
      this.selectedRange.set('custom');
      this.propagateDates();
    }
  }

  private propagateDates(): void {
    const from = this.dateFrom(), to = this.dateTo();
    switch (this.activeReport()) {
      case 'revenue':     this.revenueTrendRef?.setDateRange(from, to); break;
      case 'movies':      this.topMoviesRef?.setDateRange(from, to);    break;
      case 'users':       this.userGrowthRef?.setDateRange(from, to);   break;
      case 'withdrawals': this.withdrawalRef?.setDateRange(from, to);   break;
      case 'paying':      this.payingRef?.setDateRange(from, to);       break;
    }
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }

  exportActive(): void {
    switch (this.activeReport()) {
      case 'revenue':     this.revenueTrendRef?.export(); break;
      case 'movies':      this.topMoviesRef?.export(); break;
      case 'users':       this.userGrowthRef?.export(); break;
      case 'withdrawals': this.withdrawalRef?.export(); break;
      case 'paying':      this.payingRef?.export(); break;
    }
  }
}
