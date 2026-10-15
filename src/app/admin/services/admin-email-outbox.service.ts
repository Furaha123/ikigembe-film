import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { toParams } from './admin-payments.service';

const BASE = `${environment.apiUrl}/admin/dashboard/email-outbox`;

/** `captured`: no email provider — the message was kept for the demo and never delivered. */
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'captured';
export type EmailMessageType =
  | 'verification' | 'password_reset' | 'welcome' | 'receipt' | 'moderation' | 'casting'
  | 'membership_expiry' | 'notification' | 'admin_alert' | 'other';

/** Filters; also the URL query params of /admin/email-outbox. */
export interface EmailOutboxFilters {
  recipient?: string;
  message_type?: EmailMessageType | '';
  status?: EmailStatus | '';
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface EmailOutboxRow {
  id: number;
  to: string;
  subject: string;
  message_type: EmailMessageType;
  message_type_label: string;
  status: EmailStatus;
  status_label: string;
  related_type: string | null;
  related_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface EmailOutboxMessage extends EmailOutboxRow {
  plain: string;
  html: string;
  delivery_mode: 'send' | 'captured';
}

export interface EmailOutboxPage {
  page: number;
  page_size: number;
  total_results: number;
  total_pages: number;
  delivery_mode: 'send' | 'captured';
  message_types: { value: EmailMessageType; label: string }[];
  statuses: { value: EmailStatus; label: string }[];
  results: EmailOutboxRow[];
}

/**
 * Admin email outbox (`/api/admin/dashboard/email-outbox/`). Opening a verification or password-reset
 * message is audit-logged by the API; bodies hold single-use links, so keep them in component memory only.
 */
@Injectable({ providedIn: 'root' })
export class AdminEmailOutboxService {
  private readonly http = inject(HttpClient);

  list(filters: EmailOutboxFilters): Observable<EmailOutboxPage> {
    return this.http.get<EmailOutboxPage>(`${BASE}/`, { params: toParams(filters) });
  }

  get(id: number): Observable<EmailOutboxMessage> {
    return this.http.get<EmailOutboxMessage>(`${BASE}/${id}/`);
  }
}
