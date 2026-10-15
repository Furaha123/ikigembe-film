import { Component, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../core/services/auth.service';
import { PaymentHistoryItem, PaymentService } from '../../core/services/payment.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { purchaseViewLabel } from '../../shared/utils/purchase-view-status';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }

const base: PaymentHistoryItem = {
  deposit_id: 'dep-1', purpose: 'movie', movie_id: 12, movie_title: 'Umurage', item: 'Film: Umurage',
  amount: 1000, currency: 'RWF', status: 'Completed', created_at: '2026-10-01T10:00:00Z',
};

describe('ProfileComponent purchase history', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let payments: jasmine.SpyObj<PaymentService>;

  async function render(items: PaymentHistoryItem[]) {
    payments = jasmine.createSpyObj<PaymentService>('PaymentService', ['getHistory', 'getReceipt']);
    payments.getHistory.and.returnValue(of({ count: items.length, results: items }));
    payments.getReceipt.and.returnValue(of<never>({
      reference: 'dep-1', item: 'Film: Umurage', amount: 1000, currency: 'RWF', status: 'Completed',
      date: '2026-10-01T10:00:00Z', method: 'Mobile money',
    } as never) as never);

    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: PaymentService, useValue: payments },
        {
          provide: AuthService, useValue: {
            userRole: signal('Viewer'),
            getMe: () => of(null),
            getNotifications: () => of({ notify_new_trailers: false, notify_new_movies: false, notify_promotions: false }),
          },
        },
      ],
    })
      .overrideComponent(ProfileComponent, {
        remove: { imports: [HeaderComponent] },
        add: { imports: [HeaderStubComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
  }

  const statuses = () => Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll('[data-test="view-status"]'),
    el => el.textContent?.trim(),
  );

  it('shows each film purchase\'s view status, and nothing for fees or pending payments', async () => {
    await render([
      { ...base, deposit_id: 'a', view_status: 'available' },
      { ...base, deposit_id: 'b', view_status: 'in_progress', window_ends_at: '2026-10-15T18:00:00Z' },
      { ...base, deposit_id: 'c', view_status: 'used' },
      { ...base, deposit_id: 'd', view_status: 'expired' },
      { ...base, deposit_id: 'e', status: 'Refunded', view_status: 'refunded' },
      { ...base, deposit_id: 'f', purpose: 'actor_membership', movie_id: null, movie_title: null, view_status: null },
      { ...base, deposit_id: 'g', status: 'Pending', view_status: null },
    ]);

    expect(statuses()).toEqual([
      'payments.viewStatus.available',
      'payments.viewStatus.watching',
      'payments.viewStatus.used',
      'payments.viewStatus.expired',
      'payments.viewStatus.refunded',
    ]);
  });

  it('keeps a receipt link on every settled row', async () => {
    await render([
      { ...base, deposit_id: 'a', view_status: 'used' },
      { ...base, deposit_id: 'b', status: 'Pending', view_status: null },
    ]);
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('.ph-table .link-btn');
    expect(buttons.length).toBe(1);
    (buttons[0] as HTMLButtonElement).click();
    expect(payments.getReceipt).toHaveBeenCalledWith('a');
  });

  it('works with an API that does not send view_status yet', async () => {
    await render([{ ...base }]);
    expect(statuses()).toEqual([]);
  });
});

describe('purchaseViewLabel', () => {
  it('maps the server status to a label; Watching carries the window end', () => {
    expect(purchaseViewLabel({ view_status: 'in_progress', window_ends_at: '2026-10-15T18:00:00Z' }))
      .toEqual({ key: 'payments.viewStatus.watching', until: '2026-10-15T18:00:00Z', tone: 'live' });
    expect(purchaseViewLabel({ view_status: 'in_progress', window_ends_at: null })?.key)
      .toBe('payments.viewStatus.watchingNoTime');
    expect(purchaseViewLabel({ view_status: 'available' })?.key).toBe('payments.viewStatus.available');
    expect(purchaseViewLabel({ view_status: null })).toBeNull();
    expect(purchaseViewLabel({})).toBeNull();
  });
});
