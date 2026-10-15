import { PaymentHistoryItem } from '../../core/services/payment.service';

export interface PurchaseViewLabel {
  /** Translation key; `payments.viewStatus.watching` takes `{ time }`. */
  key: string;
  /** End of the resume window (ISO) for a purchase being watched, else null. */
  until: string | null;
  tone: 'ok' | 'live' | 'muted';
}

/**
 * Label for what is left of a film purchase (server `view_status`, see the pay-per-view policy).
 * Null for marketplace fees, pending/failed payments and older API builds without the field.
 */
export function purchaseViewLabel(p: Pick<PaymentHistoryItem, 'view_status' | 'window_ends_at'>): PurchaseViewLabel | null {
  switch (p.view_status) {
    case 'available':   return { key: 'payments.viewStatus.available', until: null, tone: 'ok' };
    case 'in_progress': return p.window_ends_at
      ? { key: 'payments.viewStatus.watching', until: p.window_ends_at, tone: 'live' }
      : { key: 'payments.viewStatus.watchingNoTime', until: null, tone: 'live' };
    case 'used':        return { key: 'payments.viewStatus.used', until: null, tone: 'muted' };
    case 'expired':     return { key: 'payments.viewStatus.expired', until: null, tone: 'muted' };
    case 'refunded':    return { key: 'payments.viewStatus.refunded', until: null, tone: 'muted' };
    default:            return null;
  }
}
