import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminAd, AdminAdPayload, AdminCmsPage, AdminCmsPagePayload } from '../../shared/models/cms.interface';

const BASE = `${environment.apiUrl}/admin/dashboard/cms`;

/** Admin CRUD for CMS pages and ad campaigns. */
@Injectable({ providedIn: 'root' })
export class AdminCmsService {
  private readonly http = inject(HttpClient);

  // ── Pages ─────────────────────────────────────────────
  listPages(): Observable<AdminCmsPage[]> {
    return this.http.get<AdminCmsPage[]>(`${BASE}/pages/`);
  }

  getPage(id: number): Observable<AdminCmsPage> {
    return this.http.get<AdminCmsPage>(`${BASE}/pages/${id}/`);
  }

  /** 400 `{ slug: [...] }` when the slug is taken or invalid. */
  createPage(payload: AdminCmsPagePayload): Observable<AdminCmsPage> {
    return this.http.post<AdminCmsPage>(`${BASE}/pages/`, payload);
  }

  updatePage(id: number, payload: Partial<AdminCmsPagePayload>): Observable<AdminCmsPage> {
    return this.http.patch<AdminCmsPage>(`${BASE}/pages/${id}/`, payload);
  }

  deletePage(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/pages/${id}/`);
  }

  // ── Ads (multipart for create/update) ─────────────────
  listAds(): Observable<AdminAd[]> {
    return this.http.get<AdminAd[]>(`${BASE}/ads/`);
  }

  createAd(payload: AdminAdPayload): Observable<AdminAd> {
    return this.http.post<AdminAd>(`${BASE}/ads/`, toAdFormData(payload));
  }

  updateAd(id: number, payload: AdminAdPayload): Observable<AdminAd> {
    return this.http.patch<AdminAd>(`${BASE}/ads/${id}/`, toAdFormData(payload));
  }

  deleteAd(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/ads/${id}/`);
  }
}

/** multipart/form-data body; the creative is only sent when a new file was chosen. */
export function toAdFormData(p: AdminAdPayload): FormData {
  const fd = new FormData();
  fd.append('name', p.name);
  fd.append('target_url', p.target_url);
  fd.append('placement', p.placement);
  fd.append('starts_at', p.starts_at);
  fd.append('ends_at', p.ends_at);
  fd.append('is_active', String(p.is_active));
  fd.append('priority', String(p.priority));
  if (p.creative) fd.append('creative', p.creative, p.creative.name);
  return fd;
}
