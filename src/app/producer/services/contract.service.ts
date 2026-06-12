import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

export interface ContractStatus {
  has_active_contract: boolean;
  contract_id: number | null;
  signed_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
}

export interface ProducerContract {
  id: number;
  version: number;
  status: 'active' | 'expired';
  signed_at: string;
  expires_at: string;
  signature_name: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly http = inject(HttpClient);

  getStatus(): Observable<ContractStatus> {
    return this.http.get<ContractStatus>(`${BASE}/contracts/status/`);
  }

  sign(signatureName: string): Observable<ProducerContract> {
    return this.http.post<ProducerContract>(`${BASE}/contracts/sign/`, {
      signature_name: signatureName,
    });
  }
}
