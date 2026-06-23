import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService } from '../../shared/services/movie.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { SeoService } from '../../core/services/seo.service';
import { ProducerSummary } from '../../shared/models/movie-api.interface';

@Component({
  selector: 'app-producers-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, HeaderComponent, FooterComponent],
  templateUrl: './producers-list.component.html',
  styleUrls: ['./producers-list.component.scss']
})
export class ProducersListComponent implements OnInit {
  private readonly movieService = inject(MovieService);
  private readonly seo          = inject(SeoService);
  readonly platformId           = inject(PLATFORM_ID);

  allProducers = signal<ProducerSummary[]>([]);
  loading      = signal(true);
  error        = signal('');
  searchQuery  = '';

  readonly skeletons = Array(12).fill(0);

  get filteredProducers(): ProducerSummary[] {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.allProducers();
    return this.allProducers().filter(p => p.name.toLowerCase().includes(q));
  }

  ngOnInit() {
    this.seo.set({
      title: 'Browse by Producer',
      description: 'Discover African cinema by the filmmakers behind it. Browse every producer on Ikigembe.',
    });
    this.loadProducers();
  }

  loadProducers() {
    this.loading.set(true);
    this.error.set('');
    this.movieService.getProducers().subscribe({
      next: (res) => { this.allProducers.set(res.results); this.loading.set(false); },
      error: ()   => { this.error.set('Could not load producers. Please try again.'); this.loading.set(false); },
    });
  }

  getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
}
