import { Injectable, signal } from '@angular/core';
import { Agreement, ContractLanguage } from '../../services/contract.service';

/** State carried between the steps of the signing flow (memory only). */
@Injectable({ providedIn: 'root' })
export class ContractFlowService {
  selectedLanguage = signal<ContractLanguage>('en');
  /** The agreement shown on the review step; its terms_version is what gets signed. */
  agreement        = signal<Agreement | null>(null);
  /** Deadline from the API; null when no film is waiting (e.g. a renewal), so there's no warning step. */
  signDeadline     = signal<string | null>(null);
  signature        = signal<Blob | null>(null);
  signedName       = signal('');

  reset() {
    this.selectedLanguage.set('en');
    this.agreement.set(null);
    this.signDeadline.set(null);
    this.signature.set(null);
    this.signedName.set('');
  }
}
