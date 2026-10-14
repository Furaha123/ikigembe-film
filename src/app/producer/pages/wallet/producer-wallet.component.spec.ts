import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { ProducerWalletComponent } from './producer-wallet.component';
import { PayoutAccount, ProducerPayouts, ProducerService, ProducerWallet } from '../../services/producer.service';

const WALLET: ProducerWallet = {
  gross_revenue: 10000, platform_commission: 3000, total_earnings: 7000, wallet_balance: 7000,
  pending_withdrawals: 0, total_withdrawn: 0, producer_share_percentage: 70,
};

const ACCOUNT: PayoutAccount = {
  method: 'mobile_money', account_holder_name: 'Jean P', country: 'RW', mobile_number: '+250788123456',
  mobile_network: 'MTN', bank_name: '', account_number: '', swift_code: '',
};

function payouts(overrides: Partial<ProducerPayouts> = {}): ProducerPayouts {
  return {
    schedule: { day: 5, minimum: 5000, next_date: '2026-11-05' }, account: null, carried_over: 0,
    results: [{
      id: 1, period: '2026-09', months: ['2026-08', '2026-09'], earned: 7700, withdrawal_offset: 0, amount: 7700,
      status: 'paid', provider: 'manual', reference: 'BK-77', failure_reason: null,
      sent_at: null, paid_at: '2026-10-06T10:00:00+02:00', created_at: '2026-10-05T00:10:00+02:00',
    }],
    ...overrides,
  };
}

describe('ProducerWalletComponent', () => {
  let fixture: ComponentFixture<ProducerWalletComponent>;
  let api: jasmine.SpyObj<ProducerService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj('ProducerService', ['getWallet', 'getPayouts', 'savePayoutAccount']);
    api.getWallet.and.returnValue(of(WALLET));
    await TestBed.configureTestingModule({
      imports: [ProducerWalletComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: ProducerService, useValue: api }],
    }).compileComponents();
  });

  function create() {
    fixture = TestBed.createComponent(ProducerWalletComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('asks for payout details when none are saved and lists the payouts', () => {
    api.getPayouts.and.returnValue(of(payouts()));
    const el = create();
    expect(fixture.componentInstance.editing()).toBeTrue();
    expect(el.querySelector('#pw-momo-number')).toBeTruthy();
    expect(el.textContent).toContain('2026-08, 2026-09');
    expect(el.textContent).toContain('BK-77');
  });

  it('shows saved details masked, not as a form', () => {
    api.getPayouts.and.returnValue(of(payouts({ account: ACCOUNT })));
    const el = create();
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('MTN · …3456');
    expect(el.textContent).not.toContain('+250788123456');
  });

  it('requires a SWIFT code for a bank abroad before calling the API', () => {
    api.getPayouts.and.returnValue(of(payouts()));
    create();
    const c = fixture.componentInstance;
    c.setMethod('bank');
    c.form.patchValue({ account_holder_name: 'Jean P', country: 'GB', bank_name: 'Barclays', account_number: 'GB29NWBK60161331926819' });
    c.save();
    expect(api.savePayoutAccount).not.toHaveBeenCalled();
    expect(c.apiError()).toBe('wallet.payouts.form.incomplete');

    api.savePayoutAccount.and.returnValue(of({ ...ACCOUNT, method: 'bank', country: 'GB', bank_name: 'Barclays',
      account_number: 'GB29NWBK60161331926819', swift_code: 'NWBKGB2L', mobile_number: '', mobile_network: '' }));
    c.form.patchValue({ swift_code: 'NWBKGB2L' });
    c.save();
    expect(api.savePayoutAccount).toHaveBeenCalledWith(jasmine.objectContaining({ method: 'bank', country: 'GB', swift_code: 'NWBKGB2L' }));
    expect(c.editing()).toBeFalse();
    expect(c.account()?.bank_name).toBe('Barclays');
  });

  it('shows the field error the API returns', () => {
    api.getPayouts.and.returnValue(of(payouts()));
    api.savePayoutAccount.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { mobile_number: ['Enter the mobile money number with its country code.'] },
    })));
    create();
    const c = fixture.componentInstance;
    c.form.patchValue({ account_holder_name: 'Jean P', mobile_number: '12345', mobile_network: 'MTN' });
    c.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('country code');
  });
});
