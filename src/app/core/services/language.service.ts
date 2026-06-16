import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

export type AppLang = 'en' | 'rw';
const STORAGE_KEY = 'ikigembe_lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translate   = inject(TranslateService);
  private readonly platformId  = inject(PLATFORM_ID);

  readonly currentLang = signal<AppLang>(this.initialLang());

  constructor() {
    this.translate.addLangs(['en', 'rw']);
    this.translate.setDefaultLang('en');
    this.translate.use(this.currentLang());
  }

  setLanguage(lang: AppLang) {
    this.currentLang.set(lang);
    this.translate.use(lang);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }

  toggle() {
    this.setLanguage(this.currentLang() === 'en' ? 'rw' : 'en');
  }

  private initialLang(): AppLang {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'rw') return 'rw';
    }
    return 'en';
  }
}
