import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HomepageView, defaultHomepageView, normalizeHomepage } from '../../shared/models/homepage.interface';

/** Give up on the configuration quickly: the home page falls back to its built-in layout. */
const CONFIG_TIMEOUT_MS = 8000;

/** The published home page configuration (`GET /api/homepage/`). Never fails: errors give the defaults. */
@Injectable({ providedIn: 'root' })
export class HomepageService {
  private readonly http = inject(HttpClient);

  getPublished(): Observable<HomepageView> {
    return this.http.get<Partial<HomepageView>>(`${environment.apiUrl}/homepage/`).pipe(
      timeout(CONFIG_TIMEOUT_MS),
      map(raw => normalizeHomepage(raw)),
      catchError(() => of(defaultHomepageView())),
    );
  }
}
