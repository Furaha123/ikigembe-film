import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';

@Component({
  selector: 'app-contract-acceptance',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  templateUrl: './contract-acceptance.component.html',
  styleUrl: './contract-acceptance.component.scss',
})
export class ContractAcceptanceComponent {
  private readonly router = inject(Router);
  readonly flow = inject(ContractFlowService);

  agreed        = signal(false);
  signatureInput = signal('');

  isValid = computed(() => this.agreed() && this.signatureInput().trim().length >= 2);

  onSignatureChange(value: string) { this.signatureInput.set(value); }

  back()     { this.router.navigate(['/producer/contracts/warning']); }
  accept() {
    if (!this.isValid()) return;
    this.flow.signatureName.set(this.signatureInput().trim());
    this.router.navigate(['/producer/contracts/verifying']);
  }
}
