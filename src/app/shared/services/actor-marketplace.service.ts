import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorProfile, ActorProfilePayload, ActorVideo, ActorVideoPurchasePayload, ApplyPayload,
  CastingApplication, CastingCall, Paginated, ServicePurchaseAccepted, ServiceQuote,
} from '../models/marketplace.interface';
import { MultipartUploadApi } from '../models/upload.interface';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

const BASE = `${environment.apiUrl}/marketplace`;

/**
 * Actor side of the marketplace (Viewer accounts with an actor profile).
 * Every call goes through the access map: a request the account may not make
 * fails with MarketplaceAccessError without being sent.
 */
@Injectable({ providedIn: 'root' })
export class ActorMarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly access = inject(MarketplaceAccessService);

  getVideoQuote(): Observable<ServiceQuote> {
    return this.access.request('talent-videos', () => this.http.get<ServiceQuote>(`${BASE}/pricing/actor_video/`));
  }

  /** 404 when the viewer has no actor profile yet. */
  getProfile(): Observable<ActorProfile> {
    return this.access.request('actor-profile', () => this.http.get<ActorProfile>(`${BASE}/profile/`));
  }

  /** Create (201) or update (200). date_of_birth is required on create. */
  saveProfile(payload: ActorProfilePayload): Observable<ActorProfile> {
    return this.access.request('actor-profile', () => this.http.put<ActorProfile>(`${BASE}/profile/`, payload));
  }

  getMyVideos(): Observable<ActorVideo[]> {
    return this.access.request('talent-videos', () => this.http.get<ActorVideo[]>(`${BASE}/actor-videos/`));
  }

  /** 400 no profile / no DOB, 409 fee payment already pending, 503 pricing not configured. */
  purchaseVideo(payload: ActorVideoPurchasePayload): Observable<ServicePurchaseAccepted> {
    return this.access.request('talent-videos', () => this.http.post<ServicePurchaseAccepted>(`${BASE}/actor-videos/purchase/`, payload));
  }

  /** Multipart endpoints for one paid video (402 fee unpaid, 409 already uploaded). */
  videoUploadApi(videoId: number): MultipartUploadApi {
    const url = `${BASE}/actor-videos/${videoId}/upload`;
    const post = <T>(step: string, body: object) =>
      this.access.request('talent-videos', () => this.http.post<T>(`${url}/${step}/`, body));
    return {
      initiate: (file) => post<{ upload_id: string; file_key: string }>(
        'initiate', { file_name: file.name, file_type: file.type }),
      signPart: (uploadId, fileKey, partNumber) => post<{ url: string }>(
        'sign-part', { upload_id: uploadId, file_key: fileKey, part_number: partNumber }),
      complete: (uploadId, fileKey, parts) => post<ActorVideo>(
        'complete', { upload_id: uploadId, file_key: fileKey, parts }),
      abort: (uploadId, fileKey) => post<{ status: string }>(
        'abort', { upload_id: uploadId, file_key: fileKey }),
    };
  }

  getCastingCalls(page = 1, search?: string, gender?: string, location?: string): Observable<Paginated<CastingCall>> {
    let params = new HttpParams().set('page', page);
    if (search?.trim())    params = params.set('search', search.trim());
    if (gender?.trim())    params = params.set('gender', gender.trim());
    if (location?.trim())  params = params.set('location', location.trim());
    return this.access.request('casting-calls', () => this.http.get<Paginated<CastingCall>>(`${BASE}/casting-calls/`, { params }));
  }

  getCastingCall(id: number): Observable<CastingCall> {
    return this.access.request('casting-calls', () => this.http.get<CastingCall>(`${BASE}/casting-calls/${id}/`));
  }

  /** 400 no profile / invalid videos, 404 closed, 409 already applied. */
  apply(callId: number, payload: ApplyPayload): Observable<CastingApplication> {
    return this.access.request('apply-casting', () => this.http.post<CastingApplication>(`${BASE}/casting-calls/${callId}/apply/`, payload));
  }

  getMyApplications(): Observable<CastingApplication[]> {
    return this.access.request('my-applications', () => this.http.get<CastingApplication[]>(`${BASE}/applications/mine/`));
  }
}
