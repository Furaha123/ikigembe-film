import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = `${environment.apiUrl}/admin/dashboard/genres`;

export interface AdminGenre {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  sort_order: number;
  /** Films (any status) carrying this genre. */
  film_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminGenrePage {
  page: number;
  page_size: number;
  total_results: number;
  total_pages: number;
  results: AdminGenre[];
}

export type GenreStatusFilter = '' | 'active' | 'inactive';

export interface AdminGenreFilters {
  q?: string;
  status?: GenreStatusFilter;
  page?: number;
  page_size?: number;
}

export interface AdminGenreWrite {
  name?: string;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * The genre vocabulary films are tagged with (`/api/admin/dashboard/genres/`, audited).
 * Errors: 409 `genre_exists` (same name, any case), 409 `genre_in_use` + `film_count` on delete
 * (deactivate instead), 400 `{ name: [...] }`.
 */
@Injectable({ providedIn: 'root' })
export class AdminGenresService {
  private readonly http = inject(HttpClient);

  list(filters: AdminGenreFilters = {}): Observable<AdminGenrePage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<AdminGenrePage>(`${BASE}/`, { params });
  }

  create(body: AdminGenreWrite): Observable<AdminGenre> {
    return this.http.post<AdminGenre>(`${BASE}/`, body);
  }

  /** A rename rewrites the name on every film; deactivating hides it from filters (films keep it). */
  update(id: number, body: AdminGenreWrite): Observable<AdminGenre> {
    return this.http.patch<AdminGenre>(`${BASE}/${id}/`, body);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${BASE}/${id}/`);
  }
}
