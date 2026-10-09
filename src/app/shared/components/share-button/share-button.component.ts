import { Component, Input, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Share a public page: the device's share sheet (Web Share API) where available, otherwise the link is
 * copied to the clipboard. Only ever shares public URLs — never signed media links.
 */
@Component({
  selector: 'app-share-button',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <button type="button" class="share-btn" (click)="share()" [attr.aria-label]="'share.label' | translate: { title: title }">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
      </svg>
      {{ 'share.button' | translate }}
    </button>
    <span class="share-status" role="status" aria-live="polite">
      @if (status()) { {{ status()! | translate }} }
    </span>
  `,
  styles: [`
    :host { display: inline-flex; align-items: center; gap: .5rem; }
    .share-btn {
      display: inline-flex; align-items: center; gap: .45rem; padding: .65rem 1.1rem; border-radius: 8px;
      border: 1.5px solid #555; background: transparent; color: #ddd; font-size: .9rem; font-weight: 600; cursor: pointer;
    }
    .share-btn:hover { border-color: #c9a84c; color: #c9a84c; }
    .share-btn:focus-visible { outline: 2px solid #c9a84c; outline-offset: 2px; }
    .share-status { font-size: .8rem; color: #c9a84c; }
  `],
})
export class ShareButtonComponent {
  private readonly platformId = inject(PLATFORM_ID);

  @Input({ required: true }) title = '';
  /** Absolute public URL; defaults to the current page without its query string. */
  @Input() url: string | null = null;
  @Input() text = '';

  status = signal<string | null>(null);

  async share(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = this.url ?? `${location.origin}${location.pathname}`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({ title: this.title, text: this.text || this.title, url });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return;   // the user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.status.set('share.copied');
    } catch {
      this.status.set('share.copyFailed');
    }
    setTimeout(() => this.status.set(null), 3000);
  }
}
