import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * First step of the agreement flow. Any producer may sign, before uploading anything: a completed
 * profile and a signed agreement are the two setup steps that unlock films and producer services.
 */
@Component({
  selector: 'app-contract-welcome',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contract-welcome.component.html',
  styleUrl: './contract-welcome.component.scss',
})
export class ContractWelcomeComponent {
  private readonly router = inject(Router);

  back()     { this.router.navigate(['/producer/dashboard']); }
  continue() { this.router.navigate(['/producer/contracts/language']); }
}
