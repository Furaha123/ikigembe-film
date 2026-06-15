import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from '../../services/admin.service';
import { ProducerContractItem } from '../../models/admin.interface';

type ContractFilter = 'all' | 'active' | 'expiring' | 'expired' | 'none';

@Component({
  selector: 'app-admin-contracts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-contracts.component.html',
  styleUrl: './admin-contracts.component.scss',
})
export class AdminContractsComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  contracts = signal<ProducerContractItem[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  filter    = signal<ContractFilter>('all');

  filtered = computed(() => {
    const f = this.filter();
    if (f === 'all') return this.contracts();
    return this.contracts().filter(c => this.contractState(c) === f);
  });

  filterCount = (f: ContractFilter) =>
    f === 'all'
      ? this.contracts().length
      : this.contracts().filter(c => this.contractState(c) === f).length;

  ngOnInit() {
    this.adminService.getProducerContracts().subscribe({
      next:  (data) => { this.contracts.set(data); this.loading.set(false); },
      error: ()     => { this.error.set('Could not load contract data.'); this.loading.set(false); },
    });
  }

  daysRemaining(c: ProducerContractItem): number {
    return Math.ceil((new Date(c.expires_at).getTime() - Date.now()) / 86400000);
  }

  contractState(c: ProducerContractItem): 'active' | 'expiring' | 'expired' | 'none' {
    if (c.status === 'expired') return 'expired';
    const days = this.daysRemaining(c);
    if (days <= 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'active';
  }

  stateLabel(state: string): string {
    if (state === 'active')   return 'Active';
    if (state === 'expiring') return 'Expiring Soon';
    if (state === 'expired')  return 'Expired';
    return 'None';
  }

  stateClass(state: string): string {
    if (state === 'active')   return 'badge-active';
    if (state === 'expiring') return 'badge-expiring';
    if (state === 'expired')  return 'badge-expired';
    return 'badge-none';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getInitials(name: string): string {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '??';
  }
}
