import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorSearchAccess, ApplicationStatus, CastingApplication, CastingCall, CastingCallPayload,
  DirectoryActor, DirectoryActorDetail, DirectoryFilters, Paginated, ServicePurchaseAccepted, ShortlistEntry, ServiceQuote,
} from '../../shared/models/marketplace.interface';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

const BASE = `${environment.apiUrl}/marketplace`;

/**
 * Producer side of the marketplace: casting calls and the paid actor directory.
 * Every call goes through the access map (see ActorMarketplaceService).
 */
@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(MarketplaceAccessService);

  getQuote(purpose: 'actor_search' | 'casting_announcement'): Observable<ServiceQuote> {
    return this.access.request(purpose === 'actor_search' ? 'find-actors' : 'my-casting-calls', () => this.http.get<ServiceQuote>(`${BASE}/pricing/${purpose}/`));
  }

  // ── Casting calls ─────────────────────────────────────────────────────

  /** Creates a draft (201). */
  createCall(payload: CastingCallPayload): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/`, payload));
  }

  getMyCalls(): Observable<CastingCall[]> {
    return this.access.request('my-casting-calls', () => this.http.get<CastingCall[]>(`${BASE}/casting-calls/mine/`));
  }

  /** One of my calls, drafts included (drafts are only visible to their producer). */
  getCall(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.get<CastingCall>(`${BASE}/casting-calls/${id}/`));
  }

  /** Drafts only — 409 otherwise. */
  updateCall(id: number, payload: Partial<CastingCallPayload>): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.patch<CastingCall>(`${BASE}/casting-calls/${id}/`, payload));
  }

  /** Upload or replace the poster for a draft call (JPEG/PNG/WebP, ≤ 5 MB). */
  uploadPoster(id: number, file: File): Observable<CastingCall> {
    const fd = new FormData();
    fd.append('poster', file);
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/poster/`, fd));
  }

  /** Remove the poster from a draft call. */
  removePoster(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.delete<CastingCall>(`${BASE}/casting-calls/${id}/poster/`));
  }

  /** Pays the announcement fee; once paid the call waits for admin review (never published by payment alone). */
  purchaseCall(id: number, phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.access.request('my-casting-calls', () => this.http.post<ServicePurchaseAccepted>(`${BASE}/casting-calls/${id}/purchase/`, phoneNumber ? { phone_number: phoneNumber } : {}));
  }

  /** Sends a paid draft or a rejected call (after edits) back to admin review — no second payment. */
  submitCall(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/submit/`, {}));
  }

  closeCall(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/close/`, {}));
  }

  getApplications(callId: number): Observable<CastingApplication[]> {
    return this.access.request('my-casting-calls', () => this.http.get<CastingApplication[]>(`${BASE}/casting-calls/${callId}/applications/`));
  }

  setApplicationStatus(applicationId: number, status: ApplicationStatus): Observable<CastingApplication> {
    return this.access.request('my-casting-calls', () => this.http.patch<CastingApplication>(`${BASE}/applications/${applicationId}/`, { status }));
  }

  // ── Actor directory (time-boxed paid pass; 403 without it) ────────────

  purchaseSearch(phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.access.request('find-actors', () => this.http.post<ServicePurchaseAccepted>(`${BASE}/actor-search/purchase/`, phoneNumber ? { phone_number: phoneNumber } : {}));
  }

  getSearchAccess(): Observable<ActorSearchAccess> {
    return this.access.request('find-actors', () => this.http.get<ActorSearchAccess>(`${BASE}/actor-search/access/`));
  }

  searchActors(filters: DirectoryFilters = {}): Observable<Paginated<DirectoryActor>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.access.request('find-actors', () => this.http.get<Paginated<DirectoryActor>>(`${BASE}/actors/`, { params }));
  }

  getActor(actorId: number): Observable<DirectoryActorDetail> {
    return this.access.request('find-actors', () => this.http.get<DirectoryActorDetail>(`${BASE}/actors/${actorId}/`));
  }

  getShortlist(): Observable<ShortlistEntry[]> {
    return this.access.request('shortlist', () => this.http.get<ShortlistEntry[]>(`${BASE}/shortlist/`));
  }

  /** 409 already shortlisted. */
  addToShortlist(actorId: number, note?: string): Observable<ShortlistEntry> {
    return this.access.request('shortlist', () => this.http.post<ShortlistEntry>(`${BASE}/shortlist/`, note ? { actor_id: actorId, note } : { actor_id: actorId }));
  }

  removeFromShortlist(actorId: number): Observable<void> {
    return this.access.request('shortlist', () => this.http.delete<void>(`${BASE}/shortlist/${actorId}/`));
  }
}
