import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';
import { ContractLanguage } from '../../../services/contract.service';

@Component({
  selector: 'app-contract-language',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contract-language.component.html',
  styleUrl: './contract-language.component.scss',
})
export class ContractLanguageComponent {
  private readonly router = inject(Router);
  readonly flow = inject(ContractFlowService);

  select(lang: ContractLanguage) {
    if (lang !== this.flow.selectedLanguage()) this.flow.agreement.set(null);
    this.flow.selectedLanguage.set(lang);
  }

  back()     { this.router.navigate(['/producer/contracts/start']); }
  continue() {
    if (this.flow.selectedLanguage()) {
      this.router.navigate(['/producer/contracts/review']);
    }
  }
}
