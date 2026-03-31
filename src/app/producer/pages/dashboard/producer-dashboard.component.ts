import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { ProducerService, ProducerWallet, ProducerMovie } from '../../services/producer.service';

@Component({
  selector: 'app-producer-dashboard',
  imports: [CommonModule],
  templateUrl: './producer-dashboard.component.html',
  styleUrl: './producer-dashboard.component.scss'
})
export class ProducerDashboardComponent implements OnInit {
  private readonly producerService = inject(ProducerService);
  readonly authService = inject(AuthService);

  wallet = signal<ProducerWallet | null>(null);
  movies = signal<ProducerMovie[]>([]);
  isLoadingWallet = signal(true);
  isLoadingMovies = signal(true);

  ngOnInit() {
    this.producerService.getWallet().subscribe({
      next: (data) => { this.wallet.set(data); this.isLoadingWallet.set(false); },
      error: () => this.isLoadingWallet.set(false),
    });

    this.producerService.getMovies().subscribe({
      next: (data) => { this.movies.set(Array.isArray(data) ? data : (data as any).results ?? []); this.isLoadingMovies.set(false); },
      error: () => this.isLoadingMovies.set(false),
    });
  }

  formatCurrency(n: number): string {
    if (n >= 1_000_000) return 'RWF ' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return 'RWF ' + (n / 1_000).toFixed(1) + 'K';
    return 'RWF ' + n.toLocaleString();
  }
}
