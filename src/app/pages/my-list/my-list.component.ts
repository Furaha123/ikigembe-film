import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { MovieService, MyListMovie } from '../../shared/services/movie.service';

@Component({
  selector: 'app-my-list',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent],
  templateUrl: './my-list.component.html',
  styleUrls: ['./my-list.component.scss']
})
export class MyListComponent implements OnInit {
  private readonly movieService = inject(MovieService);
  private readonly router = inject(Router);

  movies = signal<MyListMovie[]>([]);
  loading = signal(true);
  error = signal('');

  ngOnInit() {
    this.movieService.getMyList().subscribe({
      next: (list) => {
        this.movies.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your list. Please try again.');
        this.loading.set(false);
      }
    });
  }

  goToMovie(id: number) {
    this.router.navigate(['/movie', id]);
  }

  progressPercent(movie: MyListMovie): number {
    const progress = parseInt(movie.progress_seconds, 10) || 0;
    const duration = parseInt(movie.duration_seconds, 10) || 0;
    if (!duration) return 0;
    return Math.min(Math.round((progress / duration) * 100), 100);
  }
}
