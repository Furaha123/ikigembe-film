import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminMonthlyReportsComponent } from './admin-monthly-reports.component';
import { AdminFinanceService, MonthlyReport } from '../../services/admin-finance.service';

const REPORT: MonthlyReport = {
  id: 3, month: '2026-09', generated_at: '2026-10-01T00:10:00+02:00', generated_by: null, partial: false, net: 21000,
  data: {
    schema: 1, month: '2026-09', timezone: 'Africa/Kigali', starts_at: '', ends_at: '', generated_at: '', partial: false,
    finance_period: null,
    revenue: [{ category: 'film', label: 'Film sales', payments: 1, gross: 1000, refunds: 0, refunded: 0, net: 1000 }],
    revenue_totals: { payments: 1, gross: 1000, refunds: 0, refunded: 0, net: 1000 },
    top_films: [{ movie_id: 1, title: 'Umurage', purchases: 1, net: 1000, plays: 4 }],
    views: { playback_starts: 4, playback_completions: 2, trailer_plays: 0, page_views: 10, checkouts_opened: 1, tracking_since: null },
    users: { new_by_role: { Viewer: 2 }, total_by_role: { Viewer: 9 }, new_total: 2, total: 9 },
    films: { submitted: 1, released: 1, listed_at_generation: 5 },
    actor_uploads: { slots_paid: 0, by_fee_band: {}, approved: 0, rejected: 0 },
    producer_services: { casting_announcements: { payments: 0, gross: 0 }, actor_search_access: { payments: 0, gross: 0 },
                         casting_calls_published: 0, search_windows_started: 0 },
  },
};

describe('AdminMonthlyReportsComponent', () => {
  let fixture: ComponentFixture<AdminMonthlyReportsComponent>;
  let api: jasmine.SpyObj<AdminFinanceService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('AdminFinanceService', ['reports', 'report', 'generateReport', 'reportFile']);
    await TestBed.configureTestingModule({
      imports: [AdminMonthlyReportsComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminFinanceService, useValue: api }],
    }).compileComponents();
  });

  function create() {
    fixture = TestBed.createComponent(AdminMonthlyReportsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the empty state when no report exists', () => {
    api.reports.and.returnValue(of({ results: [] }));
    expect(create().querySelector('.empty-state')).toBeTruthy();
  });

  it('loads the newest report and renders its figures', () => {
    api.reports.and.returnValue(of({ results: [REPORT] }));
    api.report.and.returnValue(of(REPORT));
    const el = create();
    expect(api.report).toHaveBeenCalledWith(3);
    expect(el.textContent).toContain('Umurage');
    expect(el.textContent).toContain('1,000');
  });

  it('shows the API error when generating fails', () => {
    api.reports.and.returnValue(of({ results: [] }));
    api.generateReport.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: 'That month has not started yet.' } })));
    create();
    fixture.componentInstance.month = '2099-01';
    fixture.componentInstance.generate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('That month has not started yet.');
  });
});
