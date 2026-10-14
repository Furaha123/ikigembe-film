import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

const BASE = environment.apiUrl;

export type ContractLanguage = 'en' | 'rw';
export type IdentityDocumentType = 'national_id' | 'passport';

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
  /** Older contracts only (drawn on screen or an uploaded photo). */
  signature_photo_url: string | null;
  signature_method: 'id_document' | 'drawn' | 'photo';
  has_identity_document: boolean;
  identity_document_type: IdentityDocumentType | '';
  identity_document_format: 'pdf' | 'image' | null;
  signed_name: string;
  language: ContractLanguage | '';
  terms_version: number | null;
  created_at: string;
}

export interface ContractSignRequest {
  /** Copy of the National ID or passport: PDF, JPG or PNG, up to 10 MB. */
  identityDocument: File;
  identityDocumentType: IdentityDocumentType;
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

  /** Errors are `{ error, field }`; `field` names the step to fix (identity_document, signed_name, terms_version…). */
  sign(req: ContractSignRequest): Observable<ProducerContract> {
    const formData = new FormData();
    formData.append('identity_document', req.identityDocument, req.identityDocument.name);
    formData.append('identity_document_type', req.identityDocumentType);
    formData.append('signed_name', req.signedName);
    formData.append('language', req.language);
    formData.append('terms_version', String(req.termsVersion));
    formData.append('agreed', 'true');
    return this.http.post<ProducerContract>(`${BASE}/contracts/sign/`, formData);
  }
}
