import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-contract-welcome',
  standalone: true,
  templateUrl: './contract-welcome.component.html',
  styleUrl: './contract-welcome.component.scss',
})
export class ContractWelcomeComponent {
  constructor(private router: Router) {}

  back()     { this.router.navigate(['/producer/dashboard']); }
  continue() { this.router.navigate(['/producer/contracts/language']); }
}
