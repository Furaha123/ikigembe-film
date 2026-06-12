import { Component, inject, OnInit, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { ContractService, ProducerContract } from '../../../services/contract.service';
import { ContractFlowService } from '../contract-flow.service';

@Component({
  selector: 'app-contract-verification',
  standalone: true,
  templateUrl: './contract-verification.component.html',
  styleUrl: './contract-verification.component.scss',
})
export class ContractVerificationComponent implements OnInit {
  private readonly router         = inject(Router);
  private readonly contractService = inject(ContractService);
  private readonly flow            = inject(ContractFlowService);
  private readonly platformId      = inject(PLATFORM_ID);

  errorMessage = signal<string | null>(null);

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const name = this.flow.signatureName();
    if (!name) {
      this.router.navigate(['/producer/contracts/accept']);
      return;
    }

    this.contractService.sign(name).subscribe({
      next: (contract: ProducerContract) => {
        this.router.navigate(['/producer/contracts/success'], {
          state: { expiresAt: contract.expires_at },
        });
      },
      error: (err) => {
        const msg = err?.error?.detail || err?.error?.signature_name?.[0] || 'Something went wrong. Please try again.';
        this.errorMessage.set(msg);
      },
    });
  }

  retry() {
    this.errorMessage.set(null);
    this.router.navigate(['/producer/contracts/accept']);
  }
}
