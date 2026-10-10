import { Component, OnInit, inject, signal } from '@angular/core';
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
import { IVideoContent } from '../../shared/models/video-content.interface';
import { CatalogPage } from '../../shared/models/movie-api.interface';

const EMPTY: CatalogPage = { page: 1, page_size: 0, total_results: 0, total_pages: 0, sort: 'newest', results: [] };

/**
 * Public home page (signed in or not). Guests: the pitch over the featured film's backdrop, new and most
 * watched films, genres, coming soon, why Ikigembe and a closing sign-up. Signed-in viewers get the featured
 * film banner and the same rows. Every list comes from the release-aware catalog API.
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
  readonly auth = inject(AuthService);

  loading = signal(true);
  failed = signal(false);
  featured = signal<IVideoContent | null>(null);
  latest = signal<IVideoContent[]>([]);
  comingSoon = signal<IVideoContent[]>([]);
  popular = signal<IVideoContent[]>([]);
  genres = signal<{ name: string; count: number }[]>([]);

  /** Only claims the platform keeps: pay per film, Mobile Money, free trailers, producers paid per view. */
  readonly whyPoints = [
    { title: 'home.why.payPerFilm.title', text: 'home.why.payPerFilm.text' },
    { title: 'home.why.mobileMoney.title', text: 'home.why.mobileMoney.text' },
    { title: 'home.why.trailers.title', text: 'home.why.trailers.text' },
    { title: 'home.why.filmmakers.title', text: 'home.why.filmmakers.text' },
  ];

  ngOnInit(): void {
    this.seo.setTranslated({ titleKey: 'home.seoTitle', descriptionKey: 'home.seoDescription' });
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
    }).subscribe(({ featured, latest, soon, popular, genres }) => {
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
    return !this.featured() && !this.latest().length && !this.comingSoon().length;
  }
}
