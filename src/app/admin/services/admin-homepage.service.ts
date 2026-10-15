import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HomepageAdminState, HomepageContent } from '../../shared/models/homepage.interface';

const BASE = `${environment.apiUrl}/admin/dashboard/cms/homepage`;

/**
 * Admin home page editor. Every call returns the whole state (draft, published, history), so the page
 * just replaces what it shows. Saving and publishing are audit-logged by the API.
 */
@Injectable({ providedIn: 'root' })
export class AdminHomepageService {
  private readonly http = inject(HttpClient);

  getState(): Observable<HomepageAdminState> {
    return this.http.get<HomepageAdminState>(`${BASE}/`);
  }

  /** 400 `{ hero_title | cta_link | featured_movie_id | sections …: ["…"] }` on invalid content. */
  saveDraft(content: HomepageContent): Observable<HomepageAdminState> {
    return this.http.put<HomepageAdminState>(`${BASE}/draft/`, content);
  }

  /** Reset the draft to the published version (or the defaults). */
  discardDraft(): Observable<HomepageAdminState> {
    return this.http.delete<HomepageAdminState>(`${BASE}/draft/`);
  }

  /** JPG/PNG/WebP ≤ 5 MB; 400 `{ image: ["…"] }` otherwise. */
  uploadHeroImage(file: File): Observable<HomepageAdminState> {
    const body = new FormData();
    body.append('image', file);
    return this.http.post<HomepageAdminState>(`${BASE}/draft/hero-image/`, body);
  }

  removeHeroImage(): Observable<HomepageAdminState> {
    return this.http.delete<HomepageAdminState>(`${BASE}/draft/hero-image/`);
  }

  /** Copies the draft to a new live version; 400 when it is no longer valid (e.g. the film was unlisted). */
  publish(): Observable<HomepageAdminState> {
    return this.http.post<HomepageAdminState>(`${BASE}/publish/`, {});
  }
}
