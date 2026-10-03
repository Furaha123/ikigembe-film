import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { filter, takeUntil } from 'rxjs';

/** Same as SeoConfig, with translation keys that are resolved once the language file has loaded. */
export interface TranslatedSeoConfig extends Omit<SeoConfig, 'title' | 'description'> {
  titleKey: string;
  descriptionKey?: string;
}

export interface SeoConfig {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'video.movie' | 'article';
  noIndex?: boolean;
}

const SITE_NAME = 'Ikigembe';
const BASE_URL  = 'https://ikigembe.com';
const DEFAULT_IMAGE = `${BASE_URL}/assets/ikigembe.png`;
const DEFAULT_DESC  = 'Stream award-winning African cinema — movies, short films, and documentaries from across the continent.';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta       = inject(Meta);
  private readonly title      = inject(Title);
  private readonly router     = inject(Router);
  private readonly document   = inject(DOCUMENT);
  private readonly translate  = inject(TranslateService);

  constructor() {
    // Pages that don't call set() must not inherit the previous page's title, noindex or canonical.
    this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(e => {
      this.set({}, e.url);
      this.removeJsonLd();
    });
  }

  /**
   * set() with translated text. translate.instant() returns the raw key while the
   * language file is still loading (which put "auth.login.seoTitle" in the tab title).
   */
  setTranslated(config: TranslatedSeoConfig) {
    const { titleKey, descriptionKey, ...rest } = config;
    const keys = descriptionKey ? [titleKey, descriptionKey] : [titleKey];
    this.translate.get(keys).pipe(
      takeUntil(this.router.events.pipe(filter(e => e instanceof NavigationStart))),
    ).subscribe((t: Record<string, string>) => this.set({
      ...rest,
      title: t[titleKey],
      description: descriptionKey ? t[descriptionKey] : undefined,
    }));
  }

  set(config: SeoConfig, routeUrl = this.router.url) {
    const fullTitle  = config.title ? `${config.title} | ${SITE_NAME}` : SITE_NAME;
    const desc       = config.description ?? DEFAULT_DESC;
    const image      = config.image       ?? DEFAULT_IMAGE;
    const type       = config.type        ?? 'website';
    // Canonical URLs drop query strings and fragments (e.g. ?returnUrl=…).
    const path       = routeUrl.split(/[?#]/)[0];
    const url        = `${BASE_URL}${path}`;
    const privatePage = /^\/(browse|movie|profile|my-list|actor|casting|producer|admin|login|register|forgot-password|reset-password|verify-email)(\/|$)/.test(path);

    this.title.setTitle(fullTitle);

    // Standard
    this.meta.updateTag({ name: 'description', content: desc });

    // Open Graph
    this.meta.updateTag({ property: 'og:site_name',   content: SITE_NAME });
    this.meta.updateTag({ property: 'og:type',        content: type });
    this.meta.updateTag({ property: 'og:title',       content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:image',       content: image });
    this.meta.updateTag({ property: 'og:url',         content: url });

    // Twitter
    this.meta.updateTag({ name: 'twitter:card',        content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title',       content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
    this.meta.updateTag({ name: 'twitter:image',       content: image });

    // Robots
    this.meta.updateTag({ name: 'robots', content: config.noIndex || privatePage ? 'noindex, nofollow' : 'index, follow' });

    // Canonical
    this.setCanonical(url);
  }

  setMovieJsonLd(movie: {
    id: number; title: string; overview?: string; thumbnail_url?: string | null;
    release_date?: string; duration_minutes?: number; genre?: string; rating?: number;
    producer_name?: string;
  }) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Movie',
      name: movie.title,
      description: movie.overview ?? '',
      image: movie.thumbnail_url ?? DEFAULT_IMAGE,
      dateCreated: movie.release_date ?? '',
      duration: movie.duration_minutes ? `PT${movie.duration_minutes}M` : undefined,
      genre: movie.genre ?? '',
      url: `${BASE_URL}/preview/${movie.id}`,
    };
    this.injectJsonLd(schema);
  }

  removeJsonLd() {
    const el = this.document.getElementById('ld-json');
    el?.parentNode?.removeChild(el);
  }

  private setCanonical(url: string) {
    let link: HTMLLinkElement = this.document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private injectJsonLd(schema: object) {
    this.removeJsonLd();
    const script = this.document.createElement('script');
    script.id   = 'ld-json';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    this.document.head.appendChild(script);
  }
}
