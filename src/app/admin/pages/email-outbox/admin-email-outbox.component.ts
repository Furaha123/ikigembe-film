import {
  Component, ElementRef, OnInit, PLATFORM_ID, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import {
  AdminEmailOutboxService, EmailMessageType, EmailOutboxFilters, EmailOutboxMessage, EmailOutboxPage, EmailStatus,
} from '../../services/admin-email-outbox.service';
import { ModalBackdropDirective } from '../../../shared/directives/modal-backdrop.directive';
import { apiErrorMessage } from '../../../shared/utils/api-error';

const STATUSES: EmailStatus[] = ['pending', 'sent', 'failed', 'captured'];
const TYPES: EmailMessageType[] = [
  'verification', 'password_reset', 'welcome', 'receipt', 'moderation', 'casting',
  'membership_expiry', 'notification', 'admin_alert', 'other',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Status pill text: captured mail is never called sent or delivered. */
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  captured: 'Captured for demo',
  sent: 'Sent',
  failed: 'Failed',
  pending: 'Queued',
};

/** Known filters from the URL; anything else is dropped. */
export function outboxFiltersFromParams(params: ParamMap): EmailOutboxFilters {
  const status = params.get('status') as EmailStatus;
  const type = params.get('message_type') as EmailMessageType;
  const page = Number(params.get('page'));
  const date = (key: string) => (DATE.test(params.get(key) ?? '') ? params.get(key)! : '');
  return {
    recipient: params.get('recipient') ?? '',
    message_type: TYPES.includes(type) ? type : '',
    status: STATUSES.includes(status) ? status : '',
    date_from: date('date_from'),
    date_to: date('date_to'),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** http(s) links in a plain-text body, in order, without duplicates. */
export function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  return [...new Set(found.map(link => link.replace(/[.,;:]+$/, '')))];
}

/**
 * Every email the platform queued. Without an email provider (demo) messages are captured here instead
 * of delivered, so this is where verification and reset links can be opened; the API audit-logs that.
 * Message bodies stay in component memory only.
 */
@Component({
  selector: 'app-admin-email-outbox',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalBackdropDirective],
  templateUrl: './admin-email-outbox.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-email-outbox.component.scss'],
})
export class AdminEmailOutboxComponent implements OnInit {
  private readonly api = inject(AdminEmailOutboxService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly statusLabels = EMAIL_STATUS_LABELS;
  readonly statuses = STATUSES;

  filters: EmailOutboxFilters = {};
  data = signal<EmailOutboxPage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  openId = signal<number | null>(null);
  message = signal<EmailOutboxMessage | null>(null);
  messageLoading = signal(false);
  messageError = signal<string | null>(null);
  view = signal<'text' | 'html'>('text');
  readonly links = computed(() => linksIn(this.message()?.plain ?? ''));

  private readonly htmlFrame = viewChild<ElementRef<HTMLIFrameElement>>('htmlFrame');

  constructor() {
    // The HTML body goes into a sandboxed iframe (no scripts, no same-origin access), set as a
    // property in the browser only — never through bypassSecurityTrust*.
    effect(() => {
      const frame = this.htmlFrame()?.nativeElement;
      const html = this.message()?.html ?? '';
      if (frame && this.isBrowser) frame.srcdoc = html;
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.filters = outboxFiltersFromParams(params);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list({ ...this.filters, page_size: 25 }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'Could not load the email outbox.');
      },
    });
  }

  search(page = 1): void {
    const queryParams: Record<string, string | null> = {};
    for (const [k, v] of Object.entries({ ...this.filters, page })) {
      queryParams[k] = v === '' || v === undefined || (k === 'page' && v === 1) ? null : String(v);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  reset(): void {
    this.filters = {};
    this.search();
  }

  open(id: number): void {
    this.openId.set(id);
    this.view.set('text');
    this.loadMessage();
  }

  loadMessage(): void {
    const id = this.openId();
    if (id === null) return;
    this.message.set(null);
    this.messageError.set(null);
    this.messageLoading.set(true);
    this.api.get(id).subscribe({
      next: (m) => {
        if (this.openId() !== id) return;
        this.message.set(m);
        this.messageLoading.set(false);
      },
      error: (err: unknown) => {
        this.messageLoading.set(false);
        this.messageError.set(apiErrorMessage(err) ?? 'Could not open this email.');
      },
    });
  }

  close(): void {
    this.openId.set(null);
    this.message.set(null);
    this.messageError.set(null);
  }

  isAccountLink(type: EmailMessageType): boolean {
    return type === 'verification' || type === 'password_reset';
  }
}
