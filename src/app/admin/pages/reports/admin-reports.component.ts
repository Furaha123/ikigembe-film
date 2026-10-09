import { RouterLink } from '@angular/router';
import { Component, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { RevenueTrendComponent }      from './revenue-trend/revenue-trend.component';
import { TopMoviesComponent }         from './top-movies/top-movies.component';
import { UserGrowthComponent }        from './user-growth/user-growth.component';
import { WithdrawalSummaryComponent } from './withdrawal-summary/withdrawal-summary.component';
import { PayingUsersComponent }       from './paying-users/paying-users.component';
import { DatePickerComponent, type DateRange } from '../../../shared/components/date-picker/date-picker';
import { toLocalDateString } from '../../../shared/utils/local-date';

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
    TranslatePipe,
    RouterLink,
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
  dateTo        = signal<string>(toLocalDateString(new Date()));

  readonly rangePresets: RangePreset[] = ['7D', '14D', '28D', '1M', '3M', '6M', '1Y'];

  readonly reports: { key: ReportKey; label: string; sub: string; color: string }[] = [
    { key: 'revenue',     label: 'admin.reports.list.revenue.label',     sub: 'admin.reports.list.revenue.sub',     color: '#C8A84B' },
    { key: 'movies',      label: 'admin.reports.list.movies.label',      sub: 'admin.reports.list.movies.sub',      color: '#2dd4bf' },
    { key: 'users',       label: 'admin.reports.list.users.label',       sub: 'admin.reports.list.users.sub',       color: '#60a5fa' },
    { key: 'withdrawals', label: 'admin.reports.list.withdrawals.label', sub: 'admin.reports.list.withdrawals.sub', color: '#34d399' },
    { key: 'paying',      label: 'admin.reports.list.paying.label',      sub: 'admin.reports.list.paying.sub',      color: '#818cf8' },
  ];

  readonly adminExtras: Record<ReportKey, string[]> = {
    revenue:     ['admin.reports.extras.platformCommission', 'admin.reports.extras.producerShare', 'admin.reports.extras.totalPurchaseCount'],
    movies:      ['admin.reports.extras.commissionPerMovie', 'admin.reports.extras.revenuePerView', 'admin.reports.extras.uniqueViewers'],
    users:       ['admin.reports.extras.allProducers', 'admin.reports.extras.crossProducerPaying', 'admin.reports.extras.activeUserCount'],
    withdrawals: ['admin.reports.extras.withdrawalStatuses', 'admin.reports.extras.monthlyRequestVolume'],
    paying:      ['admin.reports.extras.allUsers', 'admin.reports.extras.perUserHistory', 'admin.reports.extras.contactInfo'],
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
    this.dateFrom.set(toLocalDateString(from));
    this.dateTo.set(toLocalDateString(to));
    this.propagateDates();
  }

  onDateChange(range: DateRange): void {
    if (range.start) this.dateFrom.set(toLocalDateString(range.start));
    if (range.end)   this.dateTo.set(toLocalDateString(range.end));
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
    return toLocalDateString(d);
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
