import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProducerService, ProducerMovie } from '../../services/producer.service';

@Component({
  selector: 'app-producer-movies',
  imports: [CommonModule, FormsModule],
  templateUrl: './producer-movies.component.html',
  styleUrl: './producer-movies.component.scss'
})
export class ProducerMoviesComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  private readonly router = inject(Router);

  movies = signal<ProducerMovie[]>([]);
  isLoading = signal(true);
  search = signal('');

  filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    return q
      ? this.movies().filter(m => m.title.toLowerCase().includes(q))
      : this.movies();
  });

  ngOnInit() {
    this.producerService.getMovies().subscribe({
      next: (data) => {
        this.movies.set(Array.isArray(data) ? data : (data as any).results ?? []);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  viewDetail(id: number): void {
    this.router.navigate(['/producer/movies', id]);
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }
}
