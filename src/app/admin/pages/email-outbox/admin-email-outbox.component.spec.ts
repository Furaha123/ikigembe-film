import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AdminEmailOutboxComponent, linksIn, outboxFiltersFromParams,
} from './admin-email-outbox.component';
import {
  AdminEmailOutboxService, EmailOutboxMessage, EmailOutboxPage, EmailOutboxRow,
} from '../../services/admin-email-outbox.service';

const row = (over: Partial<EmailOutboxRow> = {}): EmailOutboxRow => ({
  id: 1, to: 'aline@example.com', subject: 'Reset your Ikigembe password',
  message_type: 'password_reset', message_type_label: 'Password reset',
  status: 'captured', status_label: 'Captured for demo (not delivered)',
  related_type: 'user', related_id: '4', attempts: 0, last_error: null,
  created_at: '2026-10-14T10:00:00Z', sent_at: null, ...over,
});
const page = (results: EmailOutboxRow[]): EmailOutboxPage => ({
  page: 1, page_size: 25, total_results: results.length, total_pages: 1, delivery_mode: 'captured',
  message_types: [{ value: 'password_reset', label: 'Password reset' }],
  statuses: [{ value: 'captured', label: 'Captured' }], results,
});
const message = (over: Partial<EmailOutboxMessage> = {}): EmailOutboxMessage => ({
  ...row(), plain: 'Hi Aline,\nhttps://demo.ikigembe.rw/reset-password?token=abc.\n— The Ikigembe Team',
  html: '<p>Hi <script>alert(1)</script>Aline</p>', delivery_mode: 'captured', ...over,
});

describe('AdminEmailOutboxComponent', () => {
  let fixture: ComponentFixture<AdminEmailOutboxComponent>;
  let service: jasmine.SpyObj<AdminEmailOutboxService>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    service = jasmine.createSpyObj<AdminEmailOutboxService>('AdminEmailOutboxService', ['list', 'get']);
    service.list.and.returnValue(of(page([
      row(),
      row({ id: 2, to: 'k@example.com', subject: 'Receipt', message_type: 'receipt', message_type_label: 'Receipt', status: 'sent' }),
      row({ id: 3, status: 'failed', last_error: 'SMTPException: down' }),
    ])));
    service.get.and.returnValue(of(message()));
    query = new BehaviorSubject(convertToParamMap({ status: 'captured', message_type: 'bogus', page: '2' }));
    TestBed.configureTestingModule({
      imports: [AdminEmailOutboxComponent],
      providers: [
        provideRouter([]),
        { provide: AdminEmailOutboxService, useValue: service },
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
      ],
    });
    fixture = TestBed.createComponent(AdminEmailOutboxComponent);
    fixture.detectChanges();
  });

  it('reads known filters from the URL and ignores the rest', () => {
    expect(service.list).toHaveBeenCalledWith({
      recipient: '', message_type: '', status: 'captured', date_from: '', date_to: '', page: 2, page_size: 25,
    });
    expect(outboxFiltersFromParams(convertToParamMap({ status: 'delivered', date_from: 'yesterday', page: '-3' })))
      .toEqual({ recipient: '', message_type: '', status: '', date_from: '', date_to: '', page: 1 });
  });

  it('labels captured mail as captured for demo, never as sent', () => {
    const rows = el().querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.outbox-captured')?.textContent).toContain('Captured for demo');
    expect(rows[0].textContent).not.toContain('Sent');
    expect(rows[1].querySelector('.outbox-sent')?.textContent).toContain('Sent');
    expect(rows[2].querySelector('.outbox-failed')?.textContent).toContain('Failed');
    expect(rows[2].textContent).toContain('SMTPException: down');
    expect(el().querySelector('.demo-notice')?.textContent).toContain('not delivered');
  });

  it('previews the text body with its links and a sandboxed HTML view', () => {
    (el().querySelector('tbody tr button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.get).toHaveBeenCalledWith(1);
    const drawer = el().querySelector('[role="dialog"]')!;
    expect(drawer.querySelector('.plain-body')?.textContent).toContain('Hi Aline');
    expect(drawer.textContent).toContain('recorded in the audit log');
    const link = drawer.querySelector('.outbox-links a') as HTMLAnchorElement;
    expect(link.href).toBe('https://demo.ikigembe.rw/reset-password?token=abc');
    expect(link.rel).toContain('noopener');

    const htmlButton = Array.from(drawer.querySelectorAll('.view-toggle button'))
      .find(b => b.textContent?.includes('HTML')) as HTMLButtonElement;
    htmlButton.click();
    fixture.detectChanges();
    const frame = el().querySelector('iframe.html-frame') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.srcdoc).toContain('Aline');
  });

  it('closes the preview and shows load errors', () => {
    fixture.componentInstance.open(1);
    fixture.detectChanges();
    fixture.componentInstance.close();
    fixture.detectChanges();
    expect(el().querySelector('[role="dialog"]')).toBeNull();

    service.get.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404, error: { detail: 'Not found.' } })));
    fixture.componentInstance.open(9);
    fixture.detectChanges();
    expect(el().querySelector('[role="dialog"] [role="alert"]')).not.toBeNull();
  });

  it('finds links in plain text without trailing punctuation or duplicates', () => {
    expect(linksIn('Go to https://a.rw/x?token=1. Or https://a.rw/x?token=1, then http://b.rw')).toEqual([
      'https://a.rw/x?token=1', 'http://b.rw',
    ]);
    expect(linksIn('no links')).toEqual([]);
  });
});
