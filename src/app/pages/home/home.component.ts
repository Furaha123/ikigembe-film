import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { BannerComponent } from '../../core/components/banner/banner.component';
import { AdSlotComponent } from '../../shared/components/ad-slot/ad-slot.component';
import { MovieCarouselComponent } from '../../shared/components/movie-carousel/movie-carousel.component';
import { MovieService } from '../../shared/services/movie.service';
import { AuthService } from '../../core/services/auth.service';
import { SeoService } from '../../core/services/seo.service';
import { HomepageService } from '../../core/services/homepage.service';
import { IVideoContent } from '../../shared/models/video-content.interface';
import { CatalogPage } from '../../shared/models/movie-api.interface';
import {
  HOME_SECTION_LABELS, HomeSection, HomeSectionKey, HomepageView, defaultHomepageView, isInternalHomeLink,
  isSafeHomeLink,
} from '../../shared/models/homepage.interface';

const EMPTY: CatalogPage = { page: 1, page_size: 0, total_results: 0, total_pages: 0, sort: 'newest', results: [] };

/** Sections that only make sense for people who aren't signed in yet. */
const GUEST_ONLY: ReadonlySet<HomeSectionKey> = new Set<HomeSectionKey>(['why', 'join_cta']);

/**
 * Public home page (signed in or not). Guests: the pitch over the featured film's backdrop, then the sections
 * in the order the admin published (`GET /api/homepage/`; today's layout when nothing is published or the
 * request fails). Signed-in viewers get the featured film banner and the same sections. Every list comes from
 * the release-aware catalog API.
 *
 * `preview` renders an admin draft instead of the published configuration (admin home page editor): no
 * header/footer, no SEO, and ad slots become placeholders so nothing is tracked.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, BannerComponent,
    AdSlotComponent, MovieCarouselComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  private readonly movies = inject(MovieService);
  private readonly seo = inject(SeoService);
  private readonly homepage = inject(HomepageService);
  readonly auth = inject(AuthService);

  /** Admin preview: render this draft instead of the published configuration. */
  readonly preview = input<HomepageView | null>(null);
  /** Admin preview: show the page as a guest (true) or as a signed-in viewer (false). */
  readonly previewAsGuest = input(true);

  loading = signal(true);
  failed = signal(false);
  /** The automatic featured film (`/movies/featured/`), used when no film is configured. */
  featured = signal<IVideoContent | null>(null);
  latest = signal<IVideoContent[]>([]);
  comingSoon = signal<IVideoContent[]>([]);
  popular = signal<IVideoContent[]>([]);
  genres = signal<{ name: string; count: number }[]>([]);
  /** The published configuration (defaults until loaded or on error). */
  readonly config = signal<HomepageView>(defaultHomepageView());

  readonly labels = HOME_SECTION_LABELS;

  readonly isPreview = computed(() => this.preview() !== null);
  readonly view = computed<HomepageView>(() => this.preview() ?? this.config());
  readonly guest = computed(() => (this.isPreview() ? this.previewAsGuest() : !this.auth.isLoggedIn()));

  /** The configured film when it is still listed, else the automatic one. */
  readonly heroFilm = computed<IVideoContent | null>(() => this.view().featured ?? this.featured());
  readonly heroComingSoon = computed(() => this.heroFilm()?.release_state === 'coming_soon');
  readonly heroBackground = computed(() => {
    const film = this.heroFilm();
    return this.view().hero_image_url || film?.backdrop_url || film?.thumbnail_url || null;
  });

  /** The admin's button, when it has both a label and an allowed link. */
  readonly customCta = computed(() => {
    const { cta_label, cta_link } = this.view();
    if (!cta_label || !isSafeHomeLink(cta_link)) return null;
    return { label: cta_label, link: cta_link, internal: isInternalHomeLink(cta_link) };
  });

  readonly visibleSections = computed<HomeSection[]>(() =>
    this.view().sections.filter(s => s.visible && (this.guest() || !GUEST_ONLY.has(s.key))));

  /** Only claims the platform keeps: pay per film, Mobile Money, free trailers, producers paid per view. */
  readonly whyPoints = [
    { title: 'home.why.payPerFilm.title', text: 'home.why.payPerFilm.text' },
    { title: 'home.why.mobileMoney.title', text: 'home.why.mobileMoney.text' },
    { title: 'home.why.trailers.title', text: 'home.why.trailers.text' },
    { title: 'home.why.filmmakers.title', text: 'home.why.filmmakers.text' },
  ];

  ngOnInit(): void {
    if (!this.isPreview()) {
      this.seo.setTranslated({ titleKey: 'home.seoTitle', descriptionKey: 'home.seoDescription' });
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    let errors = 0;
    const page = (req: Observable<CatalogPage>) => req.pipe(catchError(() => { errors++; return of(EMPTY); }));
    forkJoin({
      featured: this.movies.getFeatured().pipe(
        catchError(() => { errors++; return of({ result: null as IVideoContent | null }); }),
      ),
      latest: page(this.movies.getCatalog({ sort: 'newest', page_size: 12 })),
      soon: page(this.movies.getCatalog({ availability: 'coming_soon', page_size: 12 })),
      popular: page(this.movies.getCatalog({ sort: 'most_watched', page_size: 12 })),
      // Genres are a shortcut only: a failure just hides the row and doesn't count as an outage.
      genres: this.movies.getGenres().pipe(catchError(() => of({ results: [], languages: [] }))),
      // Never fails: a missing/broken configuration gives today's layout.
      config: this.isPreview() ? of(null) : this.homepage.getPublished(),
    }).subscribe(({ featured, latest, soon, popular, genres, config }) => {
      if (config) this.config.set(config);
      this.featured.set(featured.result);
      this.latest.set(latest.results);
      this.comingSoon.set(soon.results);
      this.popular.set(popular.results);
      this.genres.set(genres.results.filter(g => g.count > 0).slice(0, 12));
      // Only a total outage is an error; a partly empty catalog is just shown as it is.
      this.failed.set(errors === 4);
      this.loading.set(false);
    });
  }

  get isEmpty(): boolean {
    return !this.heroFilm() && !this.latest().length && !this.comingSoon().length;
  }
}
