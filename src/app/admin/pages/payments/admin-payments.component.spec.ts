import { ComponentFixture, TestBed } from '@angular/core/testing';
import { convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AdminPaymentsComponent, filtersFromParams } from './admin-payments.component';
import { PaymentDetailDrawerComponent } from './payment-detail-drawer.component';
import { AdminPaymentsService, LedgerPage, PaymentDetail, toParams } from '../../services/admin-payments.service';

const ROW = {
  id: 9, reference: 'dep-123456789', user: { id: 1, name: 'Aline', email: 'a@x.rw', phone_number: null, role: 'Viewer' },
  purpose: 'movie' as const, item: 'Film: Umurage', amount: 1000, currency: 'RWF', refunded_amount: 0,
  refund_state: 'none' as const, status: 'Completed' as const, failure_reason: null, gateway: 'pawapay',
  gateway_status: null, payer_phone: null, created_at: '2026-10-01T10:00:00Z', completed_at: null, unresolved: false,
};
const PAGE: LedgerPage = {
  page: 1, page_size: 25, total_results: 1, total_pages: 1,
  totals: { paid: 1000, refunded: 0, net: 1000, currency: 'RWF' }, results: [ROW],
};

describe('payments ledger filters', () => {
  it('reads only valid filters from the URL', () => {
    const f = filtersFromParams(convertToParamMap({ status: 'Completed', purpose: 'hack', page: '3', date_from: '2026-01-01', unresolved: '1' }));
    expect(f).toEqual(jasmine.objectContaining({ status: 'Completed', purpose: '', page: 3, date_from: '2026-01-01', unresolved: true }));
  });

  it('sends only real filters to the API', () => {
    const p = toParams({ q: '', status: 'Failed', unresolved: false, page: 2 });
    expect(p.keys()).toEqual(['status', 'page']);
  });
});

describe('AdminPaymentsComponent', () => {
  let fixture: ComponentFixture<AdminPaymentsComponent>;
  let api: jasmine.SpyObj<AdminPaymentsService>;

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminPaymentsService>('AdminPaymentsService', ['ledger', 'exportCsv', 'detail']);
    api.ledger.and.returnValue(of(PAGE));
    TestBed.configureTestingModule({
      imports: [AdminPaymentsComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AdminPaymentsService, useValue: api }],
    });
    TestBed.overrideComponent(AdminPaymentsComponent, { remove: { imports: [PaymentDetailDrawerComponent] } });
    fixture = TestBed.createComponent(AdminPaymentsComponent);
    fixture.detectChanges();
  });

  it('loads the first server page and shows the totals', () => {
    expect(api.ledger).toHaveBeenCalledWith(jasmine.objectContaining({ page: 1, page_size: 25 }));
    const text = (fixture.nativeElement as HTMLElement).textContent!;
    expect(text).toContain('Film: Umurage');
    expect(text).toContain('1,000');
  });
});

describe('PaymentDetailDrawerComponent (refunds)', () => {
  let fixture: ComponentFixture<PaymentDetailDrawerComponent>;
  let api: jasmine.SpyObj<AdminPaymentsService>;
  const DETAIL: PaymentDetail = {
    ...ROW, benefit: { kind: 'film', id: 3, label: 'Umurage', state: 'access' }, refunds: [],
    refundable_amount: 1000, provider_refunds_supported: false, gateway_ref: null,
  };

  beforeEach(() => {
    api = jasmine.createSpyObj<AdminPaymentsService>('AdminPaymentsService', ['detail', 'requestRefund', 'recheck', 'completeRefund', 'failRefund']);
    api.detail.and.returnValue(of(DETAIL));
    api.requestRefund.and.returnValue(of({ id: 1, amount: 400, reason: 'x', method: 'manual', status: 'processing', reference: null, failure_reason: null, benefit_revoked: false, created_at: '', completed_at: null, requested_by: null }));
    TestBed.configureTestingModule({
      imports: [PaymentDetailDrawerComponent],
      providers: [provideTranslateService(), { provide: AdminPaymentsService, useValue: api }],
    });
    fixture = TestBed.createComponent(PaymentDetailDrawerComponent);
    fixture.componentRef.setInput('paymentId', 9);
    fixture.detectChanges();
  });

  it('defaults to a manual refund when the provider is not connected, and requires a reason', () => {
    const cmp = fixture.componentInstance;
    expect(cmp.refundMethod).toBe('manual');
    cmp.refundOpen.set(true);
    cmp.submitRefund();
    expect(api.requestRefund).not.toHaveBeenCalled();
    cmp.refundReason = 'Playback failed';
    cmp.refundAmount = 2000;
    cmp.submitRefund();
    expect(api.requestRefund).not.toHaveBeenCalled();      // above what is refundable
    cmp.refundAmount = 400;
    cmp.submitRefund();
    expect(api.requestRefund).toHaveBeenCalledOnceWith(9, { amount: 400, reason: 'Playback failed', method: 'manual' });
  });
});
