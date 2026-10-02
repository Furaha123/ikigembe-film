import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './core/services/language.service';
import { SeoService } from './core/services/seo.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'ikigembe-film';

  constructor() {
    // Created at startup so the saved language (and <html lang>) applies on every page,
    // and every navigation resets page metadata.
    inject(LanguageService);
    inject(SeoService);
  }
}
