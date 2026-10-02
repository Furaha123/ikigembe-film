import { Component, inject, signal, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';
import { ContractService } from '../../../services/contract.service';

/**
 * Shows the time left to sign before an approved film goes back to review. The
 * deadline comes from the API (set when the film was approved); without one —
 * a renewal, or no film waiting — this step is skipped.
 */
@Component({
  selector: 'app-contract-warning',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contract-warning.component.html',
  styleUrl: './contract-warning.component.scss',
})
export class ContractWarningComponent implements OnInit, OnDestroy {
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
  private readonly contractService = inject(ContractService);
  private readonly flow            = inject(ContractFlowService);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  loading  = signal(true);
  passed   = signal(false);
  timeLeft = signal({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  private deadline = 0;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.flow.agreement()) {
      this.router.navigate(['/producer/contracts/review'], { replaceUrl: true });
      return;
    }

    this.contractService.getStatus().subscribe({
      next: status => this.start(status.sign_deadline),
      // The deadline is informational here; the API enforces it. Don't block signing.
      error: () => this.start(null),
    });
  }

  ngOnDestroy() {
    if (this.intervalId !== null) clearInterval(this.intervalId);
  }

  pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  back()     { this.router.navigate(['/producer/contracts/review']); }
  continue() { this.router.navigate(['/producer/contracts/accept']); }

  private start(deadline: string | null) {
    this.flow.signDeadline.set(deadline);
    if (!deadline) {
      this.router.navigate(['/producer/contracts/accept'], { replaceUrl: true });
      return;
    }
    this.deadline = new Date(deadline).getTime();
    this.loading.set(false);
    this.tick();
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  private tick() {
    const remaining = Math.max(0, this.deadline - Date.now());
    if (remaining === 0) {
      this.passed.set(true);
      if (this.intervalId !== null) clearInterval(this.intervalId);
    }
    const totalSec = Math.floor(remaining / 1000);
    this.timeLeft.set({
      days:    Math.floor(totalSec / 86400),
      hours:   Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
    });
  }
}
