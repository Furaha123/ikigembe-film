import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

const BASE = 'https://ikigembe-backend.onrender.com/api';

export interface ProducerWallet {
  wallet_balance: number;
  total_earnings: number;
  total_withdrawn: number;
  pending_withdrawals: number;
  producer_share_percentage: number;
}

export interface ProducerMovie {
  id: number;
  title: string;
  price: number;
  views: number;
  rating: number;
  release_date: string;
  is_active: boolean;
  thumbnail_url: string | null;
}

export interface ProducerWithdrawal {
  id: number;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface WithdrawalRequest {
  amount: number;
  payment_method: 'Bank' | 'MoMo';
  bank_name?: string;
  account_number?: string;
  account_holder_name?: string;
  momo_number?: string;
  momo_provider?: string;
}

@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly http = inject(HttpClient);

  getWallet(): Observable<ProducerWallet> {
    return this.http.get<ProducerWallet>(`${BASE}/producer/dashboard/wallet/`);
  }

  getMovies(): Observable<ProducerMovie[]> {
    return this.http.get<ProducerMovie[]>(`${BASE}/producer/dashboard/movies/`);
  }

  getWithdrawals(): Observable<{ results: ProducerWithdrawal[] }> {
    return this.http.get<{ results: ProducerWithdrawal[] }>(`${BASE}/producer/dashboard/withdrawals/`);
  }

  requestWithdrawal(payload: WithdrawalRequest): Observable<ProducerWithdrawal> {
    return this.http.post<ProducerWithdrawal>(`${BASE}/producer/dashboard/withdrawals/`, payload);
  }
}
