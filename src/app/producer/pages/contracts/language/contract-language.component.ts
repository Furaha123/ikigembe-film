import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';

@Component({
  selector: 'app-contract-language',
  standalone: true,
  imports: [TranslatePipe, TranslateDirective],
  templateUrl: './contract-language.component.html',
  styleUrl: './contract-language.component.scss',
})
export class ContractLanguageComponent {
  private readonly router = inject(Router);
  readonly flow = inject(ContractFlowService);

  select(lang: 'en' | 'rw') { this.flow.selectedLanguage.set(lang); }

  back()     { this.router.navigate(['/producer/contracts/start']); }
  continue() {
    if (this.flow.selectedLanguage()) {
      this.router.navigate(['/producer/contracts/review']);
    }
  }
}
