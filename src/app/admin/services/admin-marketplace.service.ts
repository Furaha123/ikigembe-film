import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorVideo, ActorVideoStatus, AdminActionResponse, CastingCall, CastingCallStatus, Paginated,
} from '../../shared/models/marketplace.interface';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

const BASE = `${environment.apiUrl}/marketplace/admin`;

export interface MarketplaceSettings {
  actor_video_fee_under_30: number;
  actor_video_fee_30_plus:  number;
  casting_announcement_fee: number;
  actor_search_fee:         number;
  actor_search_access_days: number;
  updated_at:   string | null;
  updated_by:   number | null;
}

export type MarketplaceSettingsPayload = Omit<MarketplaceSettings, 'updated_at' | 'updated_by'>;

/** Admin moderation of actor talent videos and casting calls (gated by the access map like the rest of the marketplace). */
@Injectable({ providedIn: 'root' })
export class AdminMarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(MarketplaceAccessService);

  listActorVideos(status: ActorVideoStatus = 'pending_review', page = 1): Observable<Paginated<ActorVideo>> {
    return this.access.request('moderation', () => this.http.get<Paginated<ActorVideo>>(`${BASE}/actor-videos/`, {
      params: new HttpParams().set('status', status).set('page', page),
    }));
  }

  approveVideo(id: number): Observable<AdminActionResponse> {
    return this.access.request('moderation', () => this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/approve/`, {}));
  }

  /** Reason required (400 `{ reason }` otherwise). */
  rejectVideo(id: number, reason: string): Observable<AdminActionResponse> {
    return this.access.request('moderation', () => this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/reject/`, { reason }));
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

  // ── Marketplace fee / access settings (admin-only, no marketplace guard) ──

  getSettings(): Observable<MarketplaceSettings> {
    return this.http.get<MarketplaceSettings>(`${BASE}/settings/`);
  }

  updateSettings(data: MarketplaceSettingsPayload): Observable<MarketplaceSettings> {
    return this.http.put<MarketplaceSettings>(`${BASE}/settings/`, data);
  }
}
