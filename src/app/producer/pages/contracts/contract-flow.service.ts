import { Injectable, signal } from '@angular/core';
import { Agreement, ContractLanguage, IdentityDocumentType } from '../../services/contract.service';

/** State carried between the steps of the signing flow (memory only). */
@Injectable({ providedIn: 'root' })
export class ContractFlowService {
  selectedLanguage = signal<ContractLanguage>('en');
  /** The agreement shown on the review step; its terms_version is what gets signed. */
  agreement        = signal<Agreement | null>(null);
  /** Deadline from the API; null when no film is waiting (e.g. a renewal), so there's no warning step. */
  signDeadline     = signal<string | null>(null);
  /** The National ID / passport copy the producer signs with (never stored outside memory). */
  identityDocument     = signal<File | null>(null);
  identityDocumentType = signal<IdentityDocumentType>('national_id');
  signedName       = signal('');

  reset() {
    this.selectedLanguage.set('en');
    this.agreement.set(null);
    this.signDeadline.set(null);
    this.identityDocument.set(null);
    this.identityDocumentType.set('national_id');
    this.signedName.set('');
  }
}
