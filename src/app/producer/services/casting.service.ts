import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CastingApplication, CastingCall, CastingCallPayload, DirectoryActor, DirectoryActorDetail, DirectoryFilters,
  MembershipStatus, Paginated, ProducerPlan, ServicePurchaseAccepted, ShortlistEntry, ServiceQuote,
} from '../../shared/models/marketplace.interface';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

const BASE = `${environment.apiUrl}/marketplace`;

/**
 * Producer side of the marketplace: casting calls, the yearly producer plans and the actor directory.
 * Every call goes through the access map (see ActorMarketplaceService).
 * Plans: Full (directory + unlimited casting calls) or View-only (directory; each call pays the fee).
 * Without a plan a producer can still post calls at the per-call fee.
 */
@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(MarketplaceAccessService);

  /** Yearly plan price (`access_days` 365) or the per-call fee (`included` while a Full plan covers it). */
  getQuote(service: 'producer_full_plan' | 'producer_view_plan' | 'casting_announcement'): Observable<ServiceQuote> {
    return this.access.request(service === 'casting_announcement' ? 'my-casting-calls' : 'my-access',
      () => this.http.get<ServiceQuote>(`${BASE}/pricing/${service}/`));
  }

  // ── Yearly plans ──────────────────────────────────────────────────────

  getMembership(): Observable<MembershipStatus> {
    return this.access.request('my-access', () => this.http.get<MembershipStatus>(`${BASE}/membership/`));
  }

  /** Buying the plan you hold adds a year after the current one; 409 while a payment is pending. */
  purchasePlan(plan: ProducerPlan, phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.access.request('my-access', () => this.http.post<ServicePurchaseAccepted>(
      `${BASE}/membership/purchase/`, phoneNumber ? { plan, phone_number: phoneNumber } : { plan }));
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

  /** Pays the per-call fee; the server publishes the call once the payment is confirmed (no admin approval). */
  purchaseCall(id: number, phoneNumber: string | null): Observable<ServicePurchaseAccepted> {
    return this.access.request('my-casting-calls', () => this.http.post<ServicePurchaseAccepted>(`${BASE}/casting-calls/${id}/purchase/`, phoneNumber ? { phone_number: phoneNumber } : {}));
  }

  /** Publishes a draft covered by the Full plan (same endpoint as the fee: the server answers 200 with the call). */
  publishWithPlan(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/purchase/`, {}));
  }

  /** Publishes a paid call that isn't live yet (e.g. after moving a passed deadline) — no second payment. */
  submitCall(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/submit/`, {}));
  }

  closeCall(id: number): Observable<CastingCall> {
    return this.access.request('my-casting-calls', () => this.http.post<CastingCall>(`${BASE}/casting-calls/${id}/close/`, {}));
  }

  getApplications(callId: number): Observable<CastingApplication[]> {
    return this.access.request('my-casting-calls', () => this.http.get<CastingApplication[]>(`${BASE}/casting-calls/${callId}/applications/`));
  }

  // ── Actor directory (needs a producer plan; 403 `plan_required` without one) ──

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
