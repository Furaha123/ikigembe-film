import { Component, inject, signal, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

const HOURS_78 = 78 * 60 * 60 * 1000;

@Component({
  selector: 'app-contract-warning',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './contract-warning.component.html',
  styleUrl: './contract-warning.component.scss',
})
export class ContractWarningComponent implements OnInit, OnDestroy {
  private readonly router     = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  timeLeft = signal({ days: 3, hours: 6, minutes: 0, seconds: 0 });
  private deadline = 0;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const stored = sessionStorage.getItem('ikigembe_contract_deadline');
    if (stored) {
      this.deadline = parseInt(stored, 10);
    } else {
      this.deadline = Date.now() + HOURS_78;
      sessionStorage.setItem('ikigembe_contract_deadline', String(this.deadline));
    }

    this.tick();
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy() {
    if (this.intervalId !== null) clearInterval(this.intervalId);
  }

  private tick() {
    const remaining = Math.max(0, this.deadline - Date.now());
    const totalSec  = Math.floor(remaining / 1000);
    const days    = Math.floor(totalSec / 86400);
    const hours   = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    this.timeLeft.set({ days, hours, minutes, seconds });
  }

  pad(n: number): string { return n.toString().padStart(2, '0'); }

  back()     { this.router.navigate(['/producer/contracts/review']); }
  continue() { this.router.navigate(['/producer/contracts/accept']); }
}
