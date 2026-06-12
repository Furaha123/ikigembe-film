import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserNotification {
  id: number;
  type: 'new_movie' | 'new_trailer' | 'payment_confirmed' | 'payment_failed';
  message: string;
  movie_id: number | null;
  read: boolean;
  created_at: string;
}

export interface InboxResponse {
  unread_count: number;
  page: number;
  total_results: number;
  total_pages: number;
  results: UserNotification[];
}

@Injectable({ providedIn: 'root' })
export class InboxService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth/inbox`;

  getInbox(page = 1): Observable<InboxResponse> {
    return this.http.get<InboxResponse>(`${this.base}/?page=${page}`);
  }

  markRead(id: number): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/read/`, {});
  }

  markAllRead(): Observable<unknown> {
    return this.http.post(`${this.base}/read-all/`, {});
  }
}
