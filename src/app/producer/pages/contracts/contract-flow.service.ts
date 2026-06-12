import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ContractFlowService {
  selectedLanguage = signal<'en' | 'rw'>('en');
  signatureName    = signal<string>('');

  reset() {
    this.selectedLanguage.set('en');
    this.signatureName.set('');
  }
}
