import { Component, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContractStatus } from '../../../services/contract.service';

@Component({
  selector: 'app-contract-status-widget',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contract-status-widget.component.html',
  styleUrl: './contract-status-widget.component.scss',
})
export class ContractStatusWidgetComponent {
  status = input.required<ContractStatus>();

  state = computed<'active' | 'expiring' | 'expired' | 'none'>(() => {
    const s = this.status();
    if (!s.has_active_contract) return s.contract_id ? 'expired' : 'none';
    if (s.days_remaining !== null && s.days_remaining <= 30) return 'expiring';
    return 'active';
  });
}
