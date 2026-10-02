import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActorProfile, ActorProfilePayload, ActorVideo, ActorVideoPurchasePayload, ApplyPayload,
  CastingApplication, CastingCall, Paginated, ServicePurchaseAccepted, ServiceQuote,
} from '../models/marketplace.interface';
import { MultipartUploadApi } from '../models/upload.interface';

const BASE = `${environment.apiUrl}/marketplace`;

/** Actor side of the marketplace (Viewer accounts with an actor profile). */
@Injectable({ providedIn: 'root' })
export class ActorMarketplaceService {
  private readonly http = inject(HttpClient);

  getVideoQuote(): Observable<ServiceQuote> {
    return this.http.get<ServiceQuote>(`${BASE}/pricing/actor_video/`);
  }

  /** 404 when the viewer has no actor profile yet. */
  getProfile(): Observable<ActorProfile> {
    return this.http.get<ActorProfile>(`${BASE}/profile/`);
  }

  /** Create (201) or update (200). date_of_birth is required on create. */
  saveProfile(payload: ActorProfilePayload): Observable<ActorProfile> {
    return this.http.put<ActorProfile>(`${BASE}/profile/`, payload);
  }

  getMyVideos(): Observable<ActorVideo[]> {
    return this.http.get<ActorVideo[]>(`${BASE}/actor-videos/`);
  }

  /** 400 no profile / no DOB, 409 fee payment already pending, 503 pricing not configured. */
  purchaseVideo(payload: ActorVideoPurchasePayload): Observable<ServicePurchaseAccepted> {
    return this.http.post<ServicePurchaseAccepted>(`${BASE}/actor-videos/purchase/`, payload);
  }

  /** Multipart endpoints for one paid video (402 fee unpaid, 409 already uploaded). */
  videoUploadApi(videoId: number): MultipartUploadApi {
    const url = `${BASE}/actor-videos/${videoId}/upload`;
    return {
      initiate: (file) => this.http.post<{ upload_id: string; file_key: string }>(
        `${url}/initiate/`, { file_name: file.name, file_type: file.type }),
      signPart: (uploadId, fileKey, partNumber) => this.http.post<{ url: string }>(
        `${url}/sign-part/`, { upload_id: uploadId, file_key: fileKey, part_number: partNumber }),
      complete: (uploadId, fileKey, parts) => this.http.post<ActorVideo>(
        `${url}/complete/`, { upload_id: uploadId, file_key: fileKey, parts }),
      abort: (uploadId, fileKey) => this.http.post<{ status: string }>(
        `${url}/abort/`, { upload_id: uploadId, file_key: fileKey }),
    };
  }

  getCastingCalls(page = 1): Observable<Paginated<CastingCall>> {
    return this.http.get<Paginated<CastingCall>>(`${BASE}/casting-calls/`, {
      params: new HttpParams().set('page', page),
    });
  }

  getCastingCall(id: number): Observable<CastingCall> {
    return this.http.get<CastingCall>(`${BASE}/casting-calls/${id}/`);
  }

  /** 400 no profile / invalid videos, 404 closed, 409 already applied. */
  apply(callId: number, payload: ApplyPayload): Observable<CastingApplication> {
    return this.http.post<CastingApplication>(`${BASE}/casting-calls/${callId}/apply/`, payload);
  }

  getMyApplications(): Observable<CastingApplication[]> {
    return this.http.get<CastingApplication[]>(`${BASE}/applications/mine/`);
  }
}
