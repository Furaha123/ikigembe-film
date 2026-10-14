import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorVideo, ActorVideoStatus, AdminActionResponse, CastingCall, CastingCallStatus, MarketplacePlan, Paginated,
} from '../../shared/models/marketplace.interface';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

const BASE = `${environment.apiUrl}/marketplace/admin`;

/** Marketplace prices (RWF). The three plans last one year; the casting fee is per call (free with the Full plan). */
export interface MarketplaceSettings {
  actor_membership_fee:     number;
  producer_full_plan_fee:   number;
  producer_view_plan_fee:   number;
  casting_announcement_fee: number;
  /** Talent-video upload limits checked by the server after upload. */
  talent_video_max_mb: number;
  talent_video_max_seconds: number;
  updated_at:   string | null;
  updated_by:   number | null;
}

export type MemberStatus = 'active' | 'upcoming' | 'expired';

/** Members filters; also the URL query params of /admin/marketplace/members. */
export interface MemberFilters {
  q?: string;
  plan?: MarketplacePlan | '';
  status?: MemberStatus | '';
  page?: number;
}

/** One person and one yearly plan; renewals are folded into the period shown. */
export interface MemberRow {
  user: { id: number; name: string; email: string | null; phone_number: string | null; role: string };
  plan: MarketplacePlan;
  status: MemberStatus;
  starts_at: string;
  expires_at: string;
  member_since: string;
  years_bought: number;
}

export interface MemberPage {
  page: number;
  page_size: number;
  total_results: number;
  total_pages: number;
  /** People with each plan running right now (ignores the filters). */
  active: Record<MarketplacePlan, number>;
  results: MemberRow[];
}

function memberParams(filters: MemberFilters): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) params = params.set(key, String(value));
  }
  return params;
}

export type MarketplaceSettingsPayload = Omit<MarketplaceSettings, 'updated_at' | 'updated_by'>;

/**
 * Admin moderation of actor talent videos and casting calls (gated by the access map like the rest of the
 * marketplace). Nothing waits for approval: videos go live when the upload checks pass and casting calls
 * when the fee is paid; admins take content down afterwards.
 */
@Injectable({ providedIn: 'root' })
export class AdminMarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(MarketplaceAccessService);

  listActorVideos(status: ActorVideoStatus = 'approved', page = 1): Observable<Paginated<ActorVideo>> {
    return this.access.request('moderation', () => this.http.get<Paginated<ActorVideo>>(`${BASE}/actor-videos/`, {
      params: new HttpParams().set('status', status).set('page', page),
    }));
  }

  removeVideo(id: number, reason?: string): Observable<AdminActionResponse> {
    return this.access.request('moderation', () => this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/remove/`, reason ? { reason } : {}));
  }

  listCastingCalls(status: CastingCallStatus | '' = '', page = 1): Observable<Paginated<CastingCall>> {
    let params = new HttpParams().set('page', page);
    if (status) params = params.set('status', status);
    return this.access.request('moderation', () => this.http.get<Paginated<CastingCall>>(`${BASE}/casting-calls/`, { params }));
  }

  /** Reason required. */
  removeCastingCall(id: number, reason: string): Observable<AdminActionResponse> {
    return this.access.request('moderation', () => this.http.post<AdminActionResponse>(`${BASE}/casting-calls/${id}/remove/`, { reason }));
  }

  // ── Members (yearly plans) ──

  listMembers(filters: MemberFilters): Observable<MemberPage> {
    return this.access.request('moderation', () => this.http.get<MemberPage>(`${BASE}/members/`, { params: memberParams(filters) }));
  }

  /** CSV of every row matching the filters (no paging). */
  exportMembers(filters: MemberFilters): Observable<Blob> {
    return this.access.request('moderation', () => this.http.get(`${BASE}/members/export/`, {
      params: memberParams({ ...filters, page: undefined }), responseType: 'blob',
    }));
  }

  // ── Marketplace fee / access settings (admin-only, no marketplace guard) ──

  getSettings(): Observable<MarketplaceSettings> {
    return this.http.get<MarketplaceSettings>(`${BASE}/settings/`);
  }

  updateSettings(data: MarketplaceSettingsPayload): Observable<MarketplaceSettings> {
    return this.http.put<MarketplaceSettings>(`${BASE}/settings/`, data);
  }
}
