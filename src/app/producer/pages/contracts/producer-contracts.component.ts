import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ContractService, ContractStatus } from '../../services/contract.service';

@Component({
  selector: 'app-producer-contracts',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './producer-contracts.component.html',
  styleUrl: './producer-contracts.component.scss',
})
export class ProducerContractsComponent implements OnInit {
  private readonly contractService = inject(ContractService);

  status   = signal<ContractStatus | null>(null);
  loading  = signal(true);
  error    = signal<string | null>(null);

  state = computed<'active' | 'expiring' | 'expired' | 'none'>(() => {
    const s = this.status();
    if (!s) return 'none';
    if (!s.has_active_contract) return s.contract_id ? 'expired' : 'none';
    if (s.days_remaining !== null && s.days_remaining <= 30) return 'expiring';
    return 'active';
  });

  ngOnInit() {
    this.contractService.getStatus().subscribe({
      next:  (s) => { this.status.set(s); this.loading.set(false); },
      error: ()  => { this.error.set('Could not load contract status.'); this.loading.set(false); },
    });
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
