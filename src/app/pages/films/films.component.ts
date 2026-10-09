import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { SeoService } from '../../core/services/seo.service';
import { MovieService } from '../../shared/services/movie.service';
import {
  CatalogAvailability, CatalogFilters, CatalogPage, CatalogSort, GenresResponse,
} from '../../shared/models/movie-api.interface';

const SORTS: CatalogSort[] = ['newest', 'most_watched', 'title'];
const AVAILABILITY: CatalogAvailability[] = ['released', 'coming_soon', 'all'];
const PAGE_SIZE = 24;

/** Reads the catalog filters from the URL (invalid values are dropped). */
export function catalogFiltersFromParams(params: ParamMap): CatalogFilters {
  const sort = params.get('sort') as CatalogSort | null;
  const availability = params.get('availability') as CatalogAvailability | null;
  const year = Number(params.get('year'));
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    genre: params.get('genre') ?? '',
    language: params.get('language') ?? '',
    year: Number.isInteger(year) && year > 1900 && year < 3000 ? year : null,
    availability: availability && AVAILABILITY.includes(availability) ? availability : 'released',
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Public catalog: search, genre / language / year filters, sort, server-side pages — all kept in the URL. */
@Component({
  selector: 'app-films',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent],
  templateUrl: './films.component.html',
  styleUrl: './films.component.scss',
})
export class FilmsComponent implements OnInit {
  private readonly movies = inject(MovieService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  readonly sorts = SORTS;
  readonly availabilities = AVAILABILITY;
  readonly years = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i);

  filters: CatalogFilters = {};
  data = signal<CatalogPage | null>(null);
  facets = signal<GenresResponse | null>(null);
  loading = signal(true);
  failed = signal(false);

  ngOnInit(): void {
    this.seo.setTranslated({ titleKey: 'films.seoTitle', descriptionKey: 'films.seoDescription' });
    this.movies.getGenres().subscribe({ next: (g) => this.facets.set(g), error: () => this.facets.set(null) });
    this.route.queryParamMap.subscribe(params => {
      this.filters = catalogFiltersFromParams(params);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.movies.getCatalog({ ...this.filters, page_size: PAGE_SIZE }).subscribe({
      next: (page) => { this.data.set(page); this.loading.set(false); },
      error: () => { this.loading.set(false); this.failed.set(true); },
    });
  }

  apply(page = 1): void {
    const f = { ...this.filters, page };
    const defaults: Record<string, unknown> = { availability: 'released', sort: 'newest', page: 1 };
    const queryParams: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(f)) {
      queryParams[k] = v === '' || v === null || v === undefined || defaults[k] === v ? null : String(v);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  clear(): void {
    this.filters = {};
    this.apply();
  }

  get hasFilters(): boolean {
    const f = this.filters;
    return !!(f.q || f.genre || f.language || f.year || (f.availability && f.availability !== 'released'));
  }
}
