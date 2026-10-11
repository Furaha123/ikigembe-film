import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CmsService } from '../../services/cms.service';
import { AuthService } from '../../services/auth.service';
import { CmsPageSummary } from '../../../shared/models/cms.interface';

/** Slugs with a dedicated route; any other published page lives under /pages/<slug>. */
const CMS_ROUTES: Record<string, string> = {
  terms: '/terms', about: '/about', privacy: '/privacy', contact: '/contact',
};

export interface FooterCmsLink {
  title: string;
  /** Translation key used instead of `title` (for the built-in fallback link). */
  titleKey?: string;
  route: string;
}

/** Published pages → footer links. `<slug>-rw` translations are reached from their base page. */
export function toFooterLinks(pages: CmsPageSummary[]): FooterCmsLink[] {
  return pages
    .filter(p => !p.slug.endsWith('-rw'))
    .map(p => ({ title: p.title, route: CMS_ROUTES[p.slug] ?? `/pages/${p.slug}` }));
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent implements OnInit {
  private readonly cms = inject(CmsService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly auth = inject(AuthService);

  currentYear = new Date().getFullYear();

  /** From GET /api/pages/; the terms link stays available if the request fails. */
  cmsLinks = signal<FooterCmsLink[]>([{ title: 'Terms & Conditions', titleKey: 'footer.termsFallback', route: '/terms' }]);

  ngOnInit(): void {
    // Browser only: keeps prerendering from calling the API once per route.
    if (!isPlatformBrowser(this.platformId)) return;
    this.cms.listPages().subscribe({
      next: (pages) => { const links = toFooterLinks(pages); if (links.length) this.cmsLinks.set(links); },
      error: () => { /* keep the fallback link */ },
    });
  }

  /** Only pages that exist and that guests can open. (The old Browse/Genres/Support columns and social icons had no links.) */
  readonly exploreLinks = [
    { key: 'footer.explore.films', route: '/films' },
    { key: 'footer.explore.comingSoon', route: '/films', queryParams: { availability: 'coming_soon' } },
    { key: 'footer.explore.producers', route: '/producers' },
  ];

  /**
   * Creator links, kept out of the guest header. Guests sign up first (producers upgrade from their profile;
   * signed-in viewers have "Become a Producer" in the header).
   */
  readonly creatorLinks = computed(() => [
    ...(this.auth.isLoggedIn() ? [] : [{ key: 'footer.creators.publish', route: '/register' }]),
    { key: 'footer.creators.casting', route: '/actors-casting' },
  ]);
}
