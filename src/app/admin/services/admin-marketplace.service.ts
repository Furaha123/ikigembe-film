import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorVideo, ActorVideoStatus, AdminActionResponse, CastingCall, CastingCallStatus, Paginated,
} from '../../shared/models/marketplace.interface';

const BASE = `${environment.apiUrl}/marketplace/admin`;

/** Admin moderation of actor talent videos and casting calls. */
@Injectable({ providedIn: 'root' })
export class AdminMarketplaceService {
  private readonly http = inject(HttpClient);

  listActorVideos(status: ActorVideoStatus = 'pending_review', page = 1): Observable<Paginated<ActorVideo>> {
    return this.http.get<Paginated<ActorVideo>>(`${BASE}/actor-videos/`, {
      params: new HttpParams().set('status', status).set('page', page),
    });
  }

  approveVideo(id: number): Observable<AdminActionResponse> {
    return this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/approve/`, {});
  }

  /** Reason required (400 `{ reason }` otherwise). */
  rejectVideo(id: number, reason: string): Observable<AdminActionResponse> {
    return this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/reject/`, { reason });
  }

  removeVideo(id: number, reason?: string): Observable<AdminActionResponse> {
    return this.http.post<AdminActionResponse>(`${BASE}/actor-videos/${id}/remove/`, reason ? { reason } : {});
  }

  listCastingCalls(status: CastingCallStatus | '' = '', page = 1): Observable<Paginated<CastingCall>> {
    let params = new HttpParams().set('page', page);
    if (status) params = params.set('status', status);
    return this.http.get<Paginated<CastingCall>>(`${BASE}/casting-calls/`, { params });
  }

  /** Reason required. */
  removeCastingCall(id: number, reason: string): Observable<AdminActionResponse> {
    return this.http.post<AdminActionResponse>(`${BASE}/casting-calls/${id}/remove/`, { reason });
  }
}
