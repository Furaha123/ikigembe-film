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

  hasMovies = signal<boolean | null>(null); // null = loading

  ngOnInit() {
    this.producerService.getMovies().subscribe({
      next:  (movies) => this.hasMovies.set(movies.length > 0),
      error: ()       => this.hasMovies.set(false),
    });
  }

  back()     { this.router.navigate(['/producer/dashboard']); }
  continue() { this.router.navigate(['/producer/contracts/language']); }
}
