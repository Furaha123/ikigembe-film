import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ReportButtonComponent } from './report-button.component';
import { AuthService } from '../../../core/services/auth.service';
import { AbuseReportService } from '../../../core/services/abuse-report.service';

describe('ReportButtonComponent', () => {
  let fixture: ComponentFixture<ReportButtonComponent>;
  let api: jasmine.SpyObj<AbuseReportService>;
  const loggedIn = signal(true);

  beforeEach(async () => {
    loggedIn.set(true);
    api = jasmine.createSpyObj('AbuseReportService', ['report']);
    await TestBed.configureTestingModule({
      imports: [ReportButtonComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: AuthService, useValue: { isLoggedIn: loggedIn } },
        { provide: AbuseReportService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReportButtonComponent);
    fixture.componentRef.setInput('targetType', 'film');
    fixture.componentRef.setInput('targetId', 7);
    fixture.componentRef.setInput('label', 'Umurage');
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('asks signed-out visitors to sign in instead of showing the form', () => {
    loggedIn.set(false);
    fixture.componentInstance.open();
    fixture.detectChanges();
    expect(el().querySelector('a[href^="/login"]')).toBeTruthy();
    expect(el().querySelector('form')).toBeNull();
  });

  it('sends the chosen reason and shows the confirmation', () => {
    api.report.and.returnValue(of({ id: 1, target_type: 'film', target_id: 7, target_label: 'Umurage',
                                    category: 'copyright', status: 'open', created_at: '' }));
    const cmp = fixture.componentInstance;
    cmp.open();
    cmp.category = 'copyright';
    cmp.details = '  stolen  ';
    cmp.submit();
    fixture.detectChanges();
    expect(api.report).toHaveBeenCalledWith({ target_type: 'film', target_id: 7, category: 'copyright', details: 'stolen' });
    expect(cmp.done()).toBe('filed');
  });

  it('reports a duplicate as already reported and shows API errors', () => {
    const cmp = fixture.componentInstance;
    cmp.category = 'spam';
    api.report.and.returnValue(of({ id: 1, target_type: 'film', target_id: 7, target_label: 'Umurage',
                                    category: 'spam', status: 'open', created_at: '', already_reported: true }));
    cmp.submit();
    expect(cmp.done()).toBe('already');

    cmp.done.set(null);
    api.report.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { error: 'This item is not available.' } })));
    cmp.submit();
    expect(cmp.error()).toBe('This item is not available.');
  });
});
