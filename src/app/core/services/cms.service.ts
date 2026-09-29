import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CmsPage, CmsPageSummary } from '../../shared/models/cms.interface';
import { AppLang } from './language.service';

/** Keep server rendering / prerendering from hanging on a cold backend. */
const SERVER_TIMEOUT_MS = 8000;

/**
 * Public CMS pages. Requests are plain GETs without auth, so Angular's HTTP
 * transfer cache (enabled by provideClientHydration) hands the server-rendered
 * response to the browser without a second fetch.
 */
@Injectable({ providedIn: 'root' })
export class CmsService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly base = `${environment.apiUrl}/pages`;

  listPages(): Observable<CmsPageSummary[]> {
    return this.guard(this.http.get<CmsPageSummary[]>(`${this.base}/`));
  }

  /** 404 when the page is unpublished or unknown. */
  getPage(slug: string): Observable<CmsPage> {
    return this.guard(this.http.get<CmsPage>(`${this.base}/${encodeURIComponent(slug)}/`));
  }

  /**
   * Bilingual convention: Kinyarwanda pages are published as `<slug>-rw`.
   * In Kinyarwanda, try that first and fall back to `<slug>` on 404.
   */
  getLocalizedPage(slug: string, lang: AppLang): Observable<CmsPage> {
    if (lang !== 'rw') return this.getPage(slug);
    return this.getPage(`${slug}-rw`).pipe(
      catchError((err: unknown) =>
        err instanceof HttpErrorResponse && err.status === 404 ? this.getPage(slug) : throwError(() => err)),
    );
  }

  private guard<T>(req: Observable<T>): Observable<T> {
    return isPlatformServer(this.platformId) ? req.pipe(timeout(SERVER_TIMEOUT_MS)) : req;
  }
}
