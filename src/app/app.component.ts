import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AnalyticsService } from './core/services/analytics.service';
import { LanguageService } from './core/services/language.service';
import { SeoService } from './core/services/seo.service';
import { DOCUMENT } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslatePipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ikigembe-film';
  private readonly document = inject(DOCUMENT);

  skipToContent(event: Event): void {
    event.preventDefault();
    const content = this.document.querySelector<HTMLElement>('main, h1')
      ?? this.document.getElementById('route-content');
    if (content) {
      content.setAttribute('tabindex', '-1');
      content.focus();
      content.scrollIntoView({ block: 'start' });
    }
  }

  constructor() {
    // Created at startup so the saved language (and <html lang>) applies on every page,
    // and every navigation resets page metadata.
    inject(LanguageService);
    inject(SeoService);
    inject(AnalyticsService).start(inject(Router));
  }
}
