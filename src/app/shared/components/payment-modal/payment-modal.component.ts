import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output,
  PLATFORM_ID, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Observable, Subject, Subscription, takeUntil } from 'rxjs';
import {
  PaymentConfig, PaymentPendingConflict, PaymentReturnContext, PaymentService,
} from '../../../core/services/payment.service';
import { ServicePurchase } from '../../models/marketplace.interface';
import { apiErrorMessage } from '../../utils/api-error';
import { safeReturnUrl } from '../../utils/safe-redirect';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type StartResponse = { deposit_id: string; amount: number; demo?: boolean; payment_url?: string };

/**
 * Pays for a movie or a marketplace service with whichever gateway the backend runs:
 * - PawaPay: MoMo number → prompt on the phone → poll the status here;
 * - DPO: "Continue to secure payment" → DPO's hosted page → /payment/return polls the status.
 * Success is only ever shown after the server reports Completed.
 */
@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss']
})
export class PaymentModalComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() movie: any;
  /** Non-movie purchase (marketplace fees). When set, `movie` is ignored. */
  @Input() service: ServicePurchase | null = null;
  @Output() paid   = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  private readonly paymentService = inject(PaymentService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroy$ = new Subject<void>();
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly phoneInput = viewChild<ElementRef<HTMLInputElement>>('phoneInput');

  /** How this backend collects payments; null until loaded. */
  config          = signal<PaymentConfig | null>(null);
  phoneNumber     = signal('');
  loading         = signal(false);
  loadingMessage  = signal('paymentModal.processing'); // translation key
  success         = signal(false);
  /** Polling ran out while the deposit was still Pending: not a failure, the payer may still approve. */
  stillPending    = signal(false);
  /** An earlier hosted-page payment for this item is still open: continue it or cancel it. */
  openPayment     = signal<{ depositId: string; paymentUrl: string | null } | null>(null);
  error           = signal('');
  errorKey        = signal('');       // translated error when there is no backend message
  notice          = signal('');       // neutral, translated (e.g. "cancelled — you can start again")
  chargedAmount   = signal<number | null>(null);
  /** The server is in demo mode: label everything so nobody mistakes it for a real charge. */
  demo            = signal(false);

  private depositId: string | null = null;
  private poll?: Subscription;
  private paidTimer?: ReturnType<typeof setTimeout>;
  private returnFocusTo: HTMLElement | null = null;

  /** sessionStorage key for an unsettled deposit, so a reload or a closed modal can resume it. */
  private get pendingKey(): string | null {
    if (this.service) return this.service.pendingKey ?? null;
    return this.movie?.id != null ? `movie:${this.movie.id}` : null;
  }

  get needsPhone(): boolean {
    return this.config()?.needs_phone ?? true;
  }

  ngOnInit() {
    this.paymentService.getConfig().pipe(takeUntil(this.destroy$)).subscribe(cfg => {
      this.config.set(cfg);
      if (cfg.demo) this.demo.set(true);
      this.resumeRemembered(cfg);
    });
  }

  /** A payment for this item was started earlier and never confirmed: check it before allowing another. */
  private resumeRemembered(cfg: PaymentConfig) {
    const key = this.pendingKey;
    const resumed = key ? this.paymentService.pendingDeposit(key) : null;
    if (!resumed) return;
    this.depositId = resumed;
    this.loading.set(true);
    this.loadingMessage.set('paymentModal.checkingEarlier');
    if (!cfg.redirect) {
      this.pollStatus(resumed);
      return;
    }
    // Hosted page: one check, then offer to continue or cancel (polling here would only wait).
    this.paymentService.checkStatus(resumed).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.demo) this.demo.set(true);
        if (res.status === 'Completed') this.onCompleted();
        else if (res.status === 'Failed') this.settle();
        else this.openPayment.set({ depositId: resumed, paymentUrl: res.payment_url ?? null });
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) this.settle();
        else this.showErrorKey('paymentModal.errors.verifyFailed');
      },
    });
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.returnFocusTo = document.activeElement as HTMLElement | null;
    // Move focus into the dialog: the phone field when it is usable, else the dialog itself.
    queueMicrotask(() => {
      const input = this.phoneInput()?.nativeElement;
      if (input && !input.disabled) input.focus();
      else this.card()?.nativeElement.focus();
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.close();
  }

  /** Keeps Tab inside the dialog while it is open (WCAG 2.4.3 / aria-modal). */
  onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = Array.from(this.card()?.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  /** Closing never cancels a payment; an unconfirmed deposit stays remembered and is re-checked next time. */
  close() {
    this.closed.emit();
  }

  onPhoneInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    this.phoneNumber.set(raw);
    this.error.set('');
    this.errorKey.set('');
  }

  /** Normalise and validate a Rwandan MoMo number.
   *  Accepts: 07XXXXXXXX | 7XXXXXXXX | +2507XXXXXXXX | 2507XXXXXXXX
   *  Valid prefixes: 072 073 078 079
   *  Returns the normalised 10-digit local number or null if invalid. */
  private normaliseRwandaPhone(input: string): string | null {
    let n = input.replace(/[\s\-\(\)]/g, '');
    if (n.startsWith('+250')) n = n.slice(4);
    else if (n.startsWith('250')) n = n.slice(3);
    if (n.startsWith('0')) n = n.slice(1);

    if (!/^\d{9}$/.test(n)) return null;
    const prefix = n.slice(0, 2);
    if (!['72', '73', '78', '79'].includes(prefix)) return null;
    return '0' + n; // e.g. 0782345678
  }

  pay() {
    if (this.loading() || !this.config()) return; // one deposit at a time
    let phone: string | null = null;
    if (this.needsPhone) {
      const raw = this.phoneNumber().trim();
      if (!raw) {
        this.showErrorKey('paymentModal.errors.phoneRequired');
        return;
      }
      phone = this.normaliseRwandaPhone(raw);
      if (!phone) {
        this.showErrorKey('paymentModal.errors.invalidPhone');
        return;
      }
    }

    this.loading.set(true);
    this.loadingMessage.set('paymentModal.processing');
    this.error.set('');
    this.errorKey.set('');
    this.notice.set('');

    const start: Observable<StartResponse> = this.service
      ? this.service.initiate(phone)
      : this.paymentService.initiate(phone ? { movie_id: this.movie.id, phone_number: phone } : { movie_id: this.movie.id });

    start.pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        this.chargedAmount.set(res.amount ?? null);
        if (res.demo) this.demo.set(true);
        this.depositId = res.deposit_id;
        const key = this.pendingKey;
        if (key) this.paymentService.rememberPending(key, res.deposit_id);
        if (res.payment_url) {
          this.goToPaymentPage(res.deposit_id, res.payment_url);
          return;
        }
        this.loadingMessage.set(res.demo ? 'paymentModal.demo.simulating' : 'paymentModal.approveOnPhone');
        this.pollStatus(res.deposit_id);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err?.status === 503) {
          // Marketplace fees aren't configured in production yet.
          this.errorKey.set('marketplace.purchase.unavailable');
          return;
        }
        const conflict = err?.status === 409 ? err.error as PaymentPendingConflict | null : null;
        if (conflict?.deposit_id && conflict.payment_url) {
          // An earlier checkout for this item is still open: offer it instead of a second payment.
          const key = this.pendingKey;
          if (key) this.paymentService.rememberPending(key, conflict.deposit_id);
          this.depositId = conflict.deposit_id;
          this.openPayment.set({ depositId: conflict.deposit_id, paymentUrl: conflict.payment_url });
          return;
        }
        // Backend errors are { error } (e.g. 402 already purchased, 409 payment pending).
        this.error.set(
          apiErrorMessage(err) ?? err?.error?.message ?? err?.error?.detail ?? this.translate.instant('paymentModal.errors.failed')
        );
      }
    });
  }

  /** Continue the open hosted-page payment. */
  continueOpen() {
    const open = this.openPayment();
    if (!open) return;
    if (open.paymentUrl) {
      this.loading.set(true);
      this.goToPaymentPage(open.depositId, open.paymentUrl);
    } else {
      this.openPayment.set(null);
      this.checkAgain();
    }
  }

  /** Cancel the open payment so a new one can start. If it was paid meanwhile, that wins. */
  cancelOpen() {
    const open = this.openPayment();
    if (!open || this.loading()) return;
    this.loading.set(true);
    this.loadingMessage.set('paymentModal.cancelling');
    this.paymentService.cancel(open.depositId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.settle();
        this.paymentService.forgetReturn(open.depositId);
        this.openPayment.set(null);
        this.notice.set('paymentModal.cancelled');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 409) {
          this.openPayment.set(null);
          this.onCompleted();
          return;
        }
        this.error.set(apiErrorMessage(err) ?? this.translate.instant('paymentModal.errors.failed'));
      },
    });
  }

  /** Where /payment/return sends the buyer once the hosted-page payment settles. */
  private returnContext(): PaymentReturnContext {
    if (this.service) {
      return { kind: 'service', returnTo: safeReturnUrl(this.service.returnTo ?? this.router.url) ?? '/browse' };
    }
    return { kind: 'movie', movieId: this.movie.id };
  }

  private goToPaymentPage(depositId: string, url: string) {
    const target = this.paymentService.paymentPageTarget(url);
    if (!target) {
      // Never follow an unexpected URL; the payment stays remembered and can be resumed.
      this.loading.set(false);
      this.showErrorKey('paymentModal.errors.badPaymentPage');
      return;
    }
    this.paymentService.rememberReturn(depositId, this.returnContext());
    this.loadingMessage.set('paymentModal.redirecting');
    if ('internal' in target) void this.router.navigateByUrl(target.internal);
    else this.openExternal(target.external);
  }

  /** Separate so tests can stub it (Karma can't follow a real navigation). */
  openExternal(url: string) {
    window.location.assign(url);
  }

  /** "Still waiting" → look again (the payer may have approved late). */
  checkAgain() {
    if (!this.depositId || this.loading()) return;
    this.stillPending.set(false);
    this.loading.set(true);
    this.loadingMessage.set('paymentModal.checking');
    this.pollStatus(this.depositId);
  }

  private pollStatus(depositId: string) {
    this.poll?.unsubscribe();
    this.poll = this.paymentService.pollUntilSettled(depositId).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (res) => {
        if (res.demo) this.demo.set(true);
        if (res.status === 'Completed') {
          this.onCompleted();
        } else if (res.status === 'Failed') {
          this.settle();
          this.showErrorKey('paymentModal.errors.declined');
        }
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) {
          // The server doesn't know this deposit (e.g. a stale remembered one): start fresh.
          this.settle();
          return;
        }
        this.showErrorKey('paymentModal.errors.verifyFailed');
      },
      complete: () => {
        if (this.loading()) {
          // Out of checks but not settled: say so plainly instead of reporting a failure.
          this.loading.set(false);
          this.stillPending.set(true);
        }
      }
    });
  }

  private onCompleted() {
    const depositId = this.depositId;
    this.settle();
    if (depositId) this.paymentService.forgetReturn(depositId);
    if (!this.service) this.paymentService.savePurchase(this.movie.id);
    this.success.set(true);
    this.paidTimer = setTimeout(() => this.paid.emit(), 1800);
  }

  /** The deposit reached a final state: stop remembering it. */
  private settle() {
    this.loading.set(false);
    this.stillPending.set(false);
    const key = this.pendingKey;
    if (key) this.paymentService.forgetPending(key);
    this.depositId = null;
  }

  /** The current error is about the phone field (drives aria-invalid / aria-describedby). */
  phoneInvalid(): boolean {
    return this.errorKey() === 'paymentModal.errors.phoneRequired' || this.errorKey() === 'paymentModal.errors.invalidPhone';
  }

  /** Shows a translated local error (backend messages go through `error`). */
  private showErrorKey(key: string) {
    this.error.set('');
    this.errorKey.set(key);
  }

  ngOnDestroy() {
    clearTimeout(this.paidTimer);
    this.destroy$.next();
    this.destroy$.complete();
    if (isPlatformBrowser(this.platformId) && this.returnFocusTo?.isConnected) this.returnFocusTo.focus();
  }
}
