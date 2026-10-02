import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

export type ContractLanguage = 'en' | 'rw';

export interface ContractStatus {
  has_active_contract: boolean;
  contract_id: number | null;
  signed_at: string | null;
  expires_at: string | null;
  days_remaining: number | null;
  /** Earliest deadline before an approved film goes back to review; null when no film is waiting. */
  sign_deadline: string | null;
}

/** The agreement text, served by the API so a signature records exactly what was shown. */
export interface Agreement {
  terms_version: number;
  language: ContractLanguage;
  title: string;
  sections: { title: string; body: string }[];
  sha256: string;
}

export interface ProducerContract {
  id: number;
  version: number;
  status: 'active' | 'expired';
  signed_at: string;
  expires_at: string;
  signature_photo_url: string | null;
  signature_method: 'drawn' | 'photo';
  signed_name: string;
  language: ContractLanguage | '';
  terms_version: number | null;
  created_at: string;
}

export interface ContractSignRequest {
  /** PNG drawn on the signature pad. */
  signature: Blob;
  /** Full legal name; the API requires it to match the account's name. */
  signedName: string;
  language: ContractLanguage;
  termsVersion: number;
}

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly http = inject(HttpClient);

  getStatus(): Observable<ContractStatus> {
    return this.http.get<ContractStatus>(`${BASE}/contracts/status/`);
  }

  getAgreement(language: ContractLanguage): Observable<Agreement> {
    return this.http.get<Agreement>(`${BASE}/contracts/agreement/`, { params: { language } });
  }

  /** Errors are `{ error, field }`; `field` names the step to fix (signature, signed_name, terms_version…). */
  sign(req: ContractSignRequest): Observable<ProducerContract> {
    const formData = new FormData();
    formData.append('signature', req.signature, 'signature.png');
    formData.append('signed_name', req.signedName);
    formData.append('language', req.language);
    formData.append('terms_version', String(req.termsVersion));
    formData.append('agreed', 'true');
    return this.http.post<ProducerContract>(`${BASE}/contracts/sign/`, formData);
  }
}
