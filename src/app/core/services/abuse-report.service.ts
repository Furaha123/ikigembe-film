import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Actor targets use the actor's account id (as in the producer directory). */
export type AbuseTargetType = 'film' | 'casting_call' | 'actor';
export type AbuseCategory = 'copyright' | 'sexual' | 'violence' | 'hate' | 'scam' | 'impersonation'
  | 'minor_safety' | 'spam' | 'other';
export type AbuseStatus = 'open' | 'actioned' | 'dismissed';

export const ABUSE_CATEGORIES: AbuseCategory[] = [
  'copyright', 'sexual', 'violence', 'hate', 'scam', 'impersonation', 'minor_safety', 'spam', 'other',
];

export interface AbuseReport {
  id: number;
  target_type: AbuseTargetType;
  target_id: number;
  target_label: string;
  category: AbuseCategory;
  status: AbuseStatus;
  created_at: string;
  /** True when this person already had an open report on the item (nothing new was filed). */
  already_reported?: boolean;
}

export interface AdminAbuseReport extends AbuseReport {
  details: string;
  resolution_note: string;
  reporter: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** In-app page where the item is moderated. */
  admin_link: string;
  open_reports_for_item: number;
}

/** Reporting public content, and the admin review queue. Reports never remove content by themselves. */
@Injectable({ providedIn: 'root' })
export class AbuseReportService {
  private readonly http = inject(HttpClient);

  report(body: { target_type: AbuseTargetType; target_id: number; category: AbuseCategory; details?: string }): Observable<AbuseReport> {
    return this.http.post<AbuseReport>(`${environment.apiUrl}/abuse-reports/`, body);
  }

  adminList(filters: { status?: AbuseStatus | ''; target_type?: AbuseTargetType | '' } = {}):
    Observable<{ results: AdminAbuseReport[]; counts: Record<AbuseStatus, number> }> {
    let params = new HttpParams().set('status', filters.status ?? 'open');
    if (filters.target_type) params = params.set('target_type', filters.target_type);
    return this.http.get<{ results: AdminAbuseReport[]; counts: Record<AbuseStatus, number> }>(
      `${environment.apiUrl}/admin/dashboard/abuse-reports/`, { params });
  }

  resolve(id: number, status: 'actioned' | 'dismissed', note: string): Observable<AdminAbuseReport> {
    return this.http.post<AdminAbuseReport>(`${environment.apiUrl}/admin/dashboard/abuse-reports/${id}/resolve/`, { status, note });
  }
}
