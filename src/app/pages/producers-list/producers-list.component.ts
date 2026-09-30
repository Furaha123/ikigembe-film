import { Component, OnInit, inject, signal, PLATFORM_ID } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MovieService } from '../../shared/services/movie.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { SeoService } from '../../core/services/seo.service';
import { ProducerSummary } from '../../shared/models/movie-api.interface';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-producers-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, HeaderComponent, FooterComponent, TranslatePipe],
  templateUrl: './producers-list.component.html',
  styleUrls: ['./producers-list.component.scss']
})
export class ProducersListComponent implements OnInit {
  private readonly movieService = inject(MovieService);
  private readonly seo          = inject(SeoService);
  private readonly translate    = inject(TranslateService);
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
      title: this.translate.instant('producersPage.list.seoTitle'),
      description: this.translate.instant('producersPage.list.seoDescription'),
    });
    this.loadProducers();
  }

  loadProducers() {
    this.loading.set(true);
    this.error.set('');
    this.movieService.getProducers().subscribe({
      next: (res) => { this.allProducers.set(res.results); this.loading.set(false); },
      error: ()   => { this.error.set('producersPage.list.loadError'); this.loading.set(false); },
    });
  }

  getInitials(name: string): string {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
}
