import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AdminAbuseReportsComponent } from './admin-abuse-reports.component';
import { AbuseReportService, AdminAbuseReport } from '../../../core/services/abuse-report.service';

const REPORT: AdminAbuseReport = {
  id: 4, target_type: 'film', target_id: 7, target_label: 'Umurage', category: 'copyright', status: 'open',
  created_at: '2026-10-01T10:00:00Z', details: 'Uploaded from my channel', resolution_note: '', reporter: 'v@example.com',
  reviewed_by: null, reviewed_at: null, admin_link: '/admin/movies/edit/7', open_reports_for_item: 2,
};

describe('AdminAbuseReportsComponent', () => {
  let fixture: ComponentFixture<AdminAbuseReportsComponent>;
  let api: jasmine.SpyObj<AbuseReportService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('AbuseReportService', ['adminList', 'resolve']);
    api.adminList.and.returnValue(of({ results: [REPORT], counts: { open: 1, actioned: 0, dismissed: 0 } }));
    await TestBed.configureTestingModule({
      imports: [AdminAbuseReportsComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AbuseReportService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminAbuseReportsComponent);
    fixture.detectChanges();
  });

  it('lists open reports with a link to the moderation page', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(api.adminList).toHaveBeenCalledWith({ status: 'open', target_type: '' });
    expect(el.textContent).toContain('Umurage');
    expect(el.querySelector('a[href="/admin/movies/edit/7"]')).toBeTruthy();
  });

  it('requires a note before marking action taken', () => {
    const cmp = fixture.componentInstance;
    cmp.startResolve(4, 'actioned');
    cmp.confirmResolve();
    expect(api.resolve).not.toHaveBeenCalled();
    expect(cmp.error()).toBeTruthy();

    api.resolve.and.returnValue(of({ ...REPORT, status: 'actioned' }));
    cmp.note = 'Film unpublished pending rights check';
    cmp.confirmResolve();
    expect(api.resolve).toHaveBeenCalledWith(4, 'actioned', 'Film unpublished pending rights check');
    expect(cmp.resolving()).toBeNull();
  });
});
