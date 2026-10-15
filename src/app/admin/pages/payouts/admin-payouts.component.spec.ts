import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { AdminPayoutsComponent } from './admin-payouts.component';
import { AdminFinanceService, AdminPayout, AdminPayouts, PayoutProviderInfo } from '../../services/admin-finance.service';

function payout(overrides: Partial<AdminPayout> = {}): AdminPayout {
  return {
    id: 7, period: '2026-09', months: ['2026-09'], producer_id: 3, producer: 'Jean P', producer_email: 'jean@example.com',
    earned: 7000, withdrawal_offset: 0, amount: 7000, status: 'pending', provider: null, provider_reference: null,
    reference: null, failure_reason: null, attempts: 0, approved_by: null,
    destination: { method: 'mobile_money', account_holder_name: 'Jean P', country: 'RW', mobile_number: '+250788123456',
                   mobile_network: 'MTN', bank_name: '', account_number: '', swift_code: '' },
    sent_at: null, paid_at: null, created_at: '2026-10-05T00:10:00+02:00',
    ...overrides,
  };
}

function response(rows: AdminPayout[], provider: PayoutProviderInfo): AdminPayouts {
  const summary = { pending: { count: 0, amount: 0 }, processing: { count: 0, amount: 0 }, paid: { count: 0, amount: 0 }, failed: { count: 0, amount: 0 } };
  for (const r of rows) { summary[r.status].count++; summary[r.status].amount += r.amount; }
  return { results: rows, summary, provider, schedule: { day: 5, minimum: 5000, next_date: '2026-11-05' }, periods: ['2026-09'] };
}

const MANUAL: PayoutProviderInfo = { name: 'manual', automatic: false, ready: false };
const DEMO: PayoutProviderInfo = { name: 'demo', automatic: true, ready: true };

describe('AdminPayoutsComponent', () => {
  let fixture: ComponentFixture<AdminPayoutsComponent>;
  let api: jasmine.SpyObj<AdminFinanceService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('AdminFinanceService', ['payouts', 'sendPayout', 'sendAllPayouts', 'markPayoutPaid', 'refreshPayout']);
    await TestBed.configureTestingModule({
      imports: [AdminPayoutsComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminFinanceService, useValue: api }],
    }).compileComponents();
  });

  function create() {
    fixture = TestBed.createComponent(AdminPayoutsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function buttons(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('tbody button')).map(b => b.textContent!.trim());
  }

  it('with manual payouts offers only "record transfer"', () => {
    api.payouts.and.returnValue(of(response([payout()], MANUAL)));
    const el = create();
    expect(buttons(el)).toEqual(['admin.payouts.markPaid']);
    expect(el.textContent).toContain('+250788123456');
  });

  it('records a transfer with its reference', () => {
    api.payouts.and.returnValue(of(response([payout()], MANUAL)));
    api.markPayoutPaid.and.returnValue(of(payout({ status: 'paid', reference: 'BK-1' })));
    create();
    const c = fixture.componentInstance;
    c.startMarkPaid(payout());
    c.markPaid(payout());
    expect(api.markPayoutPaid).not.toHaveBeenCalled();     // no reference yet
    c.reference = ' BK-1 ';
    c.markPaid(payout());
    expect(api.markPayoutPaid).toHaveBeenCalledWith(7, 'BK-1');
  });

  it('with an automatic provider sends, and offers no send without payout details', () => {
    api.payouts.and.returnValue(of(response([payout(), payout({ id: 8, destination: null })], DEMO)));
    api.sendPayout.and.returnValue(of(payout({ status: 'processing' })));
    const el = create();
    expect(buttons(el)).toEqual(['admin.payouts.send', 'admin.payouts.markPaid', 'admin.payouts.markPaid']);
    expect(el.textContent).toContain('admin.payouts.noDetails');
    fixture.componentInstance.send(payout());
    expect(api.sendPayout).toHaveBeenCalledWith(7);
  });

  it('follows payouts being sent until they settle', fakeAsync(() => {
    api.payouts.and.returnValues(
      of(response([payout({ status: 'processing' })], DEMO)),
      of(response([payout({ status: 'paid', reference: 'DEMO-1' })], DEMO)),
    );
    create();
    expect(api.payouts).toHaveBeenCalledTimes(1);
    tick(4000);
    expect(api.payouts).toHaveBeenCalledTimes(2);
    tick(8000);
    expect(api.payouts).toHaveBeenCalledTimes(2);           // nothing in flight any more
    discardPeriodicTasks();
  }));

  it('shows why sending was refused', () => {
    api.payouts.and.returnValue(of(response([payout()], DEMO)));
    api.sendPayout.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 503, error: { error: 'DPO payouts are not connected yet.' },
    })));
    create();
    fixture.componentInstance.send(payout());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('not connected');
  });
});
