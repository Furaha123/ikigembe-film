import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ContractFlowService {
  selectedLanguage = signal<'en' | 'rw'>('en');
  signaturePhoto   = signal<File | null>(null);

  reset() {
    this.selectedLanguage.set('en');
    this.signaturePhoto.set(null);
  }
}
