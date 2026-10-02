import { Component, inject, OnInit, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ContractService, ProducerContract } from '../../../services/contract.service';
import { ContractFlowService } from '../contract-flow.service';
import { apiErrorMessage } from '../../../../shared/utils/api-error';

@Component({
  selector: 'app-contract-verification',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contract-verification.component.html',
  styleUrl: './contract-verification.component.scss',
})
export class ContractVerificationComponent implements OnInit {
  private readonly router          = inject(Router);
  private readonly contractService = inject(ContractService);
  private readonly flow            = inject(ContractFlowService);
  private readonly platformId      = inject(PLATFORM_ID);

  /** null while submitting; '' means "show the generic message". */
  errorMessage = signal<string | null>(null);
  /** The terms changed since they were shown: the producer must read them again. */
  private termsOutdated = false;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const signature = this.flow.signature();
    const agreement = this.flow.agreement();
    if (!signature || !agreement) {
      this.router.navigate(['/producer/contracts/accept'], { replaceUrl: true });
      return;
    }

    this.contractService.sign({
      signature,
      signedName: this.flow.signedName(),
      language: agreement.language,
      termsVersion: agreement.terms_version,
    }).subscribe({
      next: (contract: ProducerContract) => {
        this.router.navigate(['/producer/contracts/success'], {
          state: { expiresAt: contract.expires_at },
        });
      },
      error: (err: unknown) => {
        this.termsOutdated = err instanceof HttpErrorResponse && err.error?.field === 'terms_version';
        this.errorMessage.set(apiErrorMessage(err) ?? '');
      },
    });
  }

  retry() {
    this.errorMessage.set(null);
    this.flow.signature.set(null);
    if (this.termsOutdated) {
      this.flow.agreement.set(null);
      this.router.navigate(['/producer/contracts/review']);
    } else {
      this.router.navigate(['/producer/contracts/accept']);
    }
  }
}
