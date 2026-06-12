import { Component, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ContractFlowService } from '../contract-flow.service';

@Component({
  selector: 'app-contract-success',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contract-success.component.html',
  styleUrl: './contract-success.component.scss',
})
export class ContractSuccessComponent implements OnInit {
  private readonly router     = inject(Router);
  private readonly flow       = inject(ContractFlowService);
  private readonly platformId = inject(PLATFORM_ID);

  expiresAt = signal<string | null>(null);

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state as { expiresAt?: string } | undefined;
    if (state?.expiresAt) {
      this.expiresAt.set(state.expiresAt);
    }

    // Clean up flow state
    this.flow.reset();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }
}
