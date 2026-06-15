import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

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
  private readonly platformId = inject(PLATFORM_ID);

  set(config: SeoConfig) {
    const fullTitle  = config.title ? `${config.title} | ${SITE_NAME}` : SITE_NAME;
    const desc       = config.description ?? DEFAULT_DESC;
    const image      = config.image       ?? DEFAULT_IMAGE;
    const type       = config.type        ?? 'website';
    const url        = `${BASE_URL}${this.router.url}`;

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
    this.meta.updateTag({ name: 'robots', content: config.noIndex ? 'noindex, nofollow' : 'index, follow' });

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
      aggregateRating: movie.rating ? {
        '@type': 'AggregateRating',
        ratingValue: movie.rating,
        bestRating: 10,
      } : undefined,
      director: movie.producer_name ? { '@type': 'Person', name: movie.producer_name } : undefined,
      url: `${BASE_URL}/preview/${movie.id}`,
    };
    this.injectJsonLd(schema);
  }

  removeJsonLd() {
    if (!isPlatformBrowser(this.platformId)) return;
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
