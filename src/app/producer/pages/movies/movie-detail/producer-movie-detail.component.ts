import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProducerService, ProducerMovieDetail } from '../../../services/producer.service';

@Component({
  selector: 'app-producer-movie-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './producer-movie-detail.component.html',
  styleUrl: './producer-movie-detail.component.scss',
})
export class ProducerMovieDetailComponent implements OnInit {
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly producerService = inject(ProducerService);

  movie     = signal<ProducerMovieDetail | null>(null);
  isLoading = signal(true);
  hasError  = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/producer/movies']); return; }
    this.producerService.getMovieDetail(id).subscribe({
      next: (data) => { this.movie.set(data); this.isLoading.set(false); },
      error: () => { this.isLoading.set(false); this.hasError.set(true); },
    });
  }

  back(): void {
    this.router.navigate(['/producer/movies']);
  }

  watchMovie(): void {
    const id = this.movie()?.id;
    if (id) this.router.navigate(['/movie', id]);
  }

  fmt(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }

  hlsLabel(status: string): string {
    const map: Record<string, string> = {
      not_started: 'Not Processed',
      processing:  'Processing…',
      completed:   'Ready',
      failed:      'Failed',
    };
    return map[status] ?? status;
  }

  hlsClass(status: string): string {
    const map: Record<string, string> = {
      not_started: 'status-pending',
      processing:  'status-processing',
      completed:   'status-ready',
      failed:      'status-failed',
    };
    return map[status] ?? '';
  }
}
