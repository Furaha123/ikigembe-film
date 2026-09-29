import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Ad, AdPlacement } from '../../shared/models/cms.interface';

/**
 * Public ads. Tracking calls are fire-and-forget: failures (including 429)
 * are swallowed so they can never block rendering or navigation.
 */
@Injectable({ providedIn: 'root' })
export class AdsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/ads`;

  /** Live ads for a placement; an error yields an empty list. */
  list(placement: AdPlacement): Observable<Ad[]> {
    return this.http.get<Ad[]>(`${this.base}/`, { params: new HttpParams().set('placement', placement) }).pipe(
      map(list => Array.isArray(list) ? list : []),
      catchError(() => of([])),
    );
  }

  trackImpression(id: number): void {
    this.http.post(`${this.base}/${id}/impression/`, {}).subscribe({ error: () => { /* ignore */ } });
  }

  trackClick(id: number): void {
    this.http.post(`${this.base}/${id}/click/`, {}).subscribe({ error: () => { /* ignore */ } });
  }
}
