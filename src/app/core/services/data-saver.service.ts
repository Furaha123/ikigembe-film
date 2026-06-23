import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type NetworkInfo = { saveData: boolean; effectiveType: string; addEventListener(e: string, cb: () => void): void };

@Injectable({ providedIn: 'root' })
export class DataSaverService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly _active    = signal(false);

  readonly isActive = this._active.asReadonly();

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;

    const check = () =>
      !!conn && (conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g');

    this._active.set(check());
    conn?.addEventListener('change', () => this._active.set(check()));
  }
}
