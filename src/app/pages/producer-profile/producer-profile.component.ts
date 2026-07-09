import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { MovieService } from '../../shared/services/movie.service';
import { DataSaverService } from '../../core/services/data-saver.service';
import { SeoService } from '../../core/services/seo.service';
import { ProducerProfile, ProducerMoviesResponse, ProducerSummary } from '../../shared/models/movie-api.interface';
import { IVideoContent } from '../../shared/models/video-content.interface';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';

type SortOption = 'newest' | 'oldest' | 'rating' | 'popular';

// A producer's own catalog is a small, finite set — this just bounds worst-case
// pagination fan-out so a runaway producer record can't trigger hundreds of requests.
const MAX_FETCH_PAGES = 15;
const PAGE_SIZE = 15;

@Component({
  selector: 'app-producer-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, VideoPlayerComponent],
  templateUrl: './producer-profile.component.html',
  styleUrls: ['./producer-profile.component.scss'],
  animations: [
    trigger('fadeUp', [
      transition('void => *', [
        style({ opacity: 0, transform: 'translateY(14px)' }),
        animate('460ms cubic-bezier(.22,.61,.36,1)', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('staggerGrid', [
      transition('* => *', [
        query(':enter', [
          style({ opacity: 0, transform: 'translateY(18px)' }),
          stagger(35, animate('380ms cubic-bezier(.22,.61,.36,1)', style({ opacity: 1, transform: 'translateY(0)' }))),
        ], { optional: true }),
      ]),
    ]),
  ],
})
export class ProducerProfileComponent implements OnInit {
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly movieService = inject(MovieService);
  private readonly seo          = inject(SeoService);
  private readonly dataSaver    = inject(DataSaverService);
  readonly platformId           = inject(PLATFORM_ID);

  producer     = signal<ProducerProfile | null>(null);
  allMovies    = signal<IVideoContent[]>([]);
  totalMovies  = signal(0);
  loading      = signal(true);
  error        = signal('');

  relatedProducers = signal<ProducerSummary[]>([]);

  // ── Filmography controls ────────────────────────────────────────────────
  sortOption  = signal<SortOption>('newest');
  genreFilter = signal<string | null>(null);
  currentPage = signal(1);

  genresList = computed(() => {
    const set = new Set<string>();
    this.allMovies().forEach(m => m.genres?.forEach(g => set.add(g)));
    return Array.from(set).slice(0, 8);
  });

  filteredSortedMovies = computed(() => {
    const genre = this.genreFilter();
    let list = genre ? this.allMovies().filter(m => m.genres?.includes(genre)) : this.allMovies();
    list = [...list];
    switch (this.sortOption()) {
      case 'newest':  list.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || '')); break;
      case 'oldest':  list.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || '')); break;
      case 'rating':  list.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'popular': list.sort((a, b) => (b.views  || 0) - (a.views  || 0)); break;
    }
    return list;
  });

  totalFilterPages = computed(() => Math.max(1, Math.ceil(this.filteredSortedMovies().length / PAGE_SIZE)));

  pagedMovies = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredSortedMovies().slice(start, start + PAGE_SIZE);
  });

  // ── Hero backdrop ────────────────────────────────────────────────────────
  backdropUrl = computed(() =>
    this.dataSaver.isActive() ? null : (this.allMovies()[0]?.backdrop_url ?? null)
  );

  // ── Featured movie (best performing) ─────────────────────────────────────
  featuredMovie = computed<IVideoContent | null>(() => {
    const list = this.allMovies();
    if (!list.length) return null;
    return [...list].sort((a, b) => (b.views || 0) - (a.views || 0) || (b.rating || 0) - (a.rating || 0))[0];
  });

  // ── Stats (all computed from real data, no invented numbers) ────────────
  totalViews = computed(() => this.allMovies().reduce((sum, m) => sum + (m.views || 0), 0));

  estWatchHours = computed(() =>
    Math.round(this.allMovies().reduce((sum, m) => sum + (m.views || 0) * (m.duration_minutes || 0), 0) / 60)
  );

  memberSince = computed(() => {
    const joined = this.producer()?.date_joined;
    if (!joined) return null;
    const year = new Date(joined).getFullYear();
    return Number.isNaN(year) ? null : year;
  });

  // Animated (count-up) display values shown in the stat cards
  displayMovieCount = signal(0);
  displayViews      = signal(0);
  displayHours      = signal(0);

  // ── About section ────────────────────────────────────────────────────────
  aboutExpanded = signal(false);

  // ── Trailer modal ─────────────────────────────────────────────────────────
  trailerUrl    = signal<string | null>(null);
  trailerPoster = signal<string>('');

  shareCopied = signal(false);

  readonly skeletons = Array(10).fill(0);

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.reset();
      this.loadProducer(id);
      this.loadRelatedProducers(id);
    });
  }

  private reset() {
    this.producer.set(null);
    this.allMovies.set([]);
    this.currentPage.set(1);
    this.sortOption.set('newest');
    this.genreFilter.set(null);
    this.error.set('');
    this.displayMovieCount.set(0);
    this.displayViews.set(0);
    this.displayHours.set(0);
  }

  private loadProducer(id: number) {
    this.loading.set(true);
    this.movieService.getMoviesByProducer(id, 1).subscribe({
      next: (first) => {
        const pagesToFetch = Math.min(first.total_pages, MAX_FETCH_PAGES);
        if (pagesToFetch <= 1) {
          this.onAllMoviesLoaded(first.producer, first.results, first.total_results);
          return;
        }

        const rest: Observable<ProducerMoviesResponse>[] = [];
        for (let p = 2; p <= pagesToFetch; p++) {
          rest.push(
            this.movieService.getMoviesByProducer(id, p).pipe(
              catchError(() => of({ ...first, results: [] } as ProducerMoviesResponse))
            )
          );
        }

        forkJoin(rest).subscribe(pages => {
          const merged = [first.results, ...pages.map(p => p.results)].flat();
          this.onAllMoviesLoaded(first.producer, merged, first.total_results);
        });
      },
      error: () => {
        this.error.set('Producer not found.');
        this.loading.set(false);
      },
    });
  }

  private onAllMoviesLoaded(producer: ProducerProfile, movies: IVideoContent[], totalResults: number) {
    this.producer.set(producer);
    this.allMovies.set(movies);
    this.totalMovies.set(totalResults);
    this.loading.set(false);
    this.animateStats();

    this.seo.set({
      title: producer.name,
      description: producer.bio ?? `Watch films by ${producer.name} on Ikigembe — African cinema streaming.`,
      image: movies[0]?.backdrop_url ?? undefined,
    });
  }

  private loadRelatedProducers(excludeId: number) {
    this.movieService.getProducers().pipe(
      map(res => res.results.filter(p => p.id !== excludeId)),
      catchError(() => of([] as ProducerSummary[]))
    ).subscribe(list => {
      const shuffled = [...list].sort(() => Math.random() - 0.5);
      this.relatedProducers.set(shuffled.slice(0, 6));
    });
  }

  // ── Count-up animation ───────────────────────────────────────────────────
  private animateStats() {
    if (!isPlatformBrowser(this.platformId)) {
      this.displayMovieCount.set(this.totalMovies());
      this.displayViews.set(this.totalViews());
      this.displayHours.set(this.estWatchHours());
      return;
    }
    this.countUp(this.displayMovieCount, this.totalMovies());
    this.countUp(this.displayViews, this.totalViews());
    this.countUp(this.displayHours, this.estWatchHours());
  }

  private countUp(target: ReturnType<typeof signal<number>>, end: number, duration = 900) {
    if (end <= 0) { target.set(0); return; }
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      target.set(Math.round(end * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ── Filmography controls ─────────────────────────────────────────────────
  setSort(option: SortOption) {
    this.sortOption.set(option);
    this.currentPage.set(1);
  }

  setGenreFilter(genre: string | null) {
    this.genreFilter.set(genre);
    this.currentPage.set(1);
  }

  prevPage() {
    if (this.currentPage() <= 1) return;
    this.currentPage.update(p => p - 1);
    this.scrollToFilmography();
  }

  nextPage() {
    if (this.currentPage() >= this.totalFilterPages()) return;
    this.currentPage.update(p => p + 1);
    this.scrollToFilmography();
  }

  private scrollToFilmography() {
    if (!isPlatformBrowser(this.platformId)) return;
    document.getElementById('filmography')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── About ─────────────────────────────────────────────────────────────────
  toggleAbout() {
    this.aboutExpanded.update(v => !v);
  }

  // ── Trailer ───────────────────────────────────────────────────────────────
  playTrailer(movie: IVideoContent) {
    if (!movie.trailer_url) return;
    this.trailerPoster.set(movie.thumbnail_url);
    this.trailerUrl.set(movie.trailer_url);
  }

  closeTrailer() {
    this.trailerUrl.set(null);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  goToMovie(id: number) {
    this.router.navigate(['/movie', id]);
  }

  // ── Share ─────────────────────────────────────────────────────────────────
  async share() {
    if (!isPlatformBrowser(this.platformId)) return;
    const producer = this.producer();
    if (!producer) return;
    const url = window.location.href;

    if (navigator.share) {
      try { await navigator.share({ title: producer.name, url }); } catch { /* user cancelled */ }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.shareCopied.set(true);
      setTimeout(() => this.shareCopied.set(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
}
