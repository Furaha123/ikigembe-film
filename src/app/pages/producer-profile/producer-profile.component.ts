import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MovieService } from '../../shared/services/movie.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { SeoService } from '../../core/services/seo.service';
import { ProducerProfile } from '../../shared/models/movie-api.interface';
import { IVideoContent } from '../../shared/models/video-content.interface';

@Component({
  selector: 'app-producer-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, HeaderComponent, FooterComponent],
  templateUrl: './producer-profile.component.html',
  styleUrls: ['./producer-profile.component.scss']
})
export class ProducerProfileComponent implements OnInit {
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly movieService = inject(MovieService);
  private readonly seo          = inject(SeoService);
  readonly platformId           = inject(PLATFORM_ID);

  producer    = signal<ProducerProfile | null>(null);
  movies      = signal<IVideoContent[]>([]);
  loading     = signal(true);
  error       = signal('');
  currentPage = signal(1);
  totalPages  = signal(1);
  totalMovies = signal(0);

  backdropUrl = computed(() => this.movies()[0]?.backdrop_url ?? null);

  readonly skeletons = Array(8).fill(0);

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.producer.set(null);
      this.movies.set([]);
      this.loadPage(id, 1);
    });
  }

  loadPage(id: number, page: number) {
    this.loading.set(true);
    this.movieService.getMoviesByProducer(id, page).subscribe({
      next: (res) => {
        this.producer.set(res.producer);
        this.movies.set(res.results);
        this.totalPages.set(res.total_pages);
        this.totalMovies.set(res.total_results);
        this.currentPage.set(res.page);
        this.loading.set(false);
        this.seo.set({
          title: res.producer.name,
          description: res.producer.bio
            ?? `Watch films by ${res.producer.name} on Ikigembe — African cinema streaming.`,
          image: res.results[0]?.backdrop_url ?? undefined,
        });
      },
      error: () => {
        this.error.set('Producer not found.');
        this.loading.set(false);
      },
    });
  }

  prevPage() {
    const id = this.producer()?.id;
    if (!id || this.currentPage() <= 1) return;
    this.loadPage(id, this.currentPage() - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  nextPage() {
    const id = this.producer()?.id;
    if (!id || this.currentPage() >= this.totalPages()) return;
    this.loadPage(id, this.currentPage() + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToMovie(id: number) {
    this.router.navigate(['/movie', id]);
  }
}
