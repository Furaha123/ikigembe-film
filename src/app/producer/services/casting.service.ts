import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorSearchAccess, ApplicationStatus, CastingApplication, CastingCall, CastingCallPayload,
  DirectoryActor, DirectoryActorDetail, DirectoryFilters, Paginated, ServicePurchaseAccepted, ShortlistEntry, ServiceQuote,
} from '../../shared/models/marketplace.interface';

const BASE = `${environment.apiUrl}/marketplace`;

/** Producer side of the marketplace: casting calls and the paid actor directory. */
@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly http = inject(HttpClient);

  getQuote(purpose: 'actor_search' | 'casting_announcement'): Observable<ServiceQuote> {
    return this.http.get<ServiceQuote>(`${BASE}/pricing/${purpose}/`);
  }

  // ── Casting calls ─────────────────────────────────────────────────────

  /** Creates a draft (201). */
  createCall(payload: CastingCallPayload): Observable<CastingCall> {
    return this.http.post<CastingCall>(`${BASE}/casting-calls/`, payload);
  }

  getMyCalls(): Observable<CastingCall[]> {
    return this.http.get<CastingCall[]>(`${BASE}/casting-calls/mine/`);
  }

  /** Drafts only — 409 otherwise. */
  updateCall(id: number, payload: Partial<CastingCallPayload>): Observable<CastingCall> {
    return this.http.patch<CastingCall>(`${BASE}/casting-calls/${id}/`, payload);
  }

  /** Publishes automatically once the fee payment completes. 400/409/503 as documented. */
  purchaseCall(id: number, phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.http.post<ServicePurchaseAccepted>(`${BASE}/casting-calls/${id}/purchase/`, phoneNumber ? { phone_number: phoneNumber } : {});
  }

  closeCall(id: number): Observable<CastingCall> {
    return this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/close/`, {});
  }

  getApplications(callId: number): Observable<CastingApplication[]> {
    return this.http.get<CastingApplication[]>(`${BASE}/casting-calls/${callId}/applications/`);
  }

  setApplicationStatus(applicationId: number, status: ApplicationStatus): Observable<CastingApplication> {
    return this.http.patch<CastingApplication>(`${BASE}/applications/${applicationId}/`, { status });
  }

  // ── Actor directory (time-boxed paid pass; 403 without it) ────────────

  purchaseSearch(phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.http.post<ServicePurchaseAccepted>(`${BASE}/actor-search/purchase/`, phoneNumber ? { phone_number: phoneNumber } : {});
  }

  getSearchAccess(): Observable<ActorSearchAccess> {
    return this.http.get<ActorSearchAccess>(`${BASE}/actor-search/access/`);
  }

  searchActors(filters: DirectoryFilters = {}): Observable<Paginated<DirectoryActor>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Paginated<DirectoryActor>>(`${BASE}/actors/`, { params });
  }

  getActor(actorId: number): Observable<DirectoryActorDetail> {
    return this.http.get<DirectoryActorDetail>(`${BASE}/actors/${actorId}/`);
  }

  getShortlist(): Observable<ShortlistEntry[]> {
    return this.http.get<ShortlistEntry[]>(`${BASE}/shortlist/`);
  }

  /** 409 already shortlisted. */
  addToShortlist(actorId: number, note?: string): Observable<ShortlistEntry> {
    return this.http.post<ShortlistEntry>(`${BASE}/shortlist/`, note ? { actor_id: actorId, note } : { actor_id: actorId });
  }

  removeFromShortlist(actorId: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/shortlist/${actorId}/`);
  }
}
