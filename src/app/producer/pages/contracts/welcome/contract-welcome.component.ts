import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { ProducerService } from '../../../services/producer.service';

@Component({
  selector: 'app-contract-welcome',
  standalone: true,
  imports: [TranslatePipe, TranslateDirective, RouterLink],
  templateUrl: './contract-welcome.component.html',
  styleUrl: './contract-welcome.component.scss',
})
export class ContractWelcomeComponent implements OnInit {
  private readonly router           = inject(Router);
  private readonly producerService  = inject(ProducerService);

  eligibility = signal<'loading' | 'no_movies' | 'not_approved' | 'eligible'>('loading');

  ngOnInit() {
    this.producerService.getMovies().subscribe({
      next: (movies) => {
        if (movies.length === 0) {
          this.eligibility.set('no_movies');
        } else if (movies.some(m => m.approval_status === 'approved' || m.approval_status === 'approved_pending_contract')) {
          this.eligibility.set('eligible');
        } else {
          this.eligibility.set('not_approved');
        }
      },
      error: () => this.eligibility.set('no_movies'),
    });
  }

  back()     { this.router.navigate(['/producer/dashboard']); }
  continue() { this.router.navigate(['/producer/contracts/language']); }
}
