import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminSectionTabsComponent } from '../../shared/components/admin-section-tabs.component';
import {
  AdminMarketplaceService, MemberFilters, MemberPage, MemberStatus,
} from '../../services/admin-marketplace.service';
import { MarketplacePlan } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

export const MEMBER_PLANS: MarketplacePlan[] = ['actor', 'producer_full', 'producer_view'];
export const MEMBER_STATUSES: MemberStatus[] = ['active', 'upcoming', 'expired'];

/** Reads the members filters from the URL (unknown values are ignored). */
export function memberFiltersFromParams(params: ParamMap): MemberFilters {
  const pick = <T extends string>(key: string, allowed: readonly T[]) => {
    const value = params.get(key) as T | null;
    return value && allowed.includes(value) ? value : '';
  };
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').trim(),
    plan: pick('plan', MEMBER_PLANS),
    status: pick('status', MEMBER_STATUSES),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/**
 * Who holds a yearly marketplace plan: one row per person and plan (renewals folded in), the people
 * active right now per plan, filters kept in the URL and a CSV of the same filters.
 */
@Component({
  selector: 'app-admin-marketplace-members',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, AdminSectionTabsComponent],
  templateUrl: './admin-marketplace-members.component.html',
  styleUrls: ['../payments/admin-payments.component.scss', './admin-marketplace-members.component.scss'],
})
export class AdminMarketplaceMembersComponent implements OnInit {
  private readonly marketplace = inject(AdminMarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly plans = MEMBER_PLANS;
  readonly statuses = MEMBER_STATUSES;

  filters: MemberFilters = {};
  data = signal<MemberPage | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  exporting = signal(false);

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.filters = memberFiltersFromParams(params);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.listMembers(this.filters).subscribe({
      next: (page) => { this.data.set(page); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'admin.members.loadFailed');
      },
    });
  }

  /** Apply the form: the URL is the source of truth (shareable, survives reloads). */
  search(page = 1): void {
    const f = { ...this.filters, page };
    const queryParams: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(f)) {
      queryParams[k] = v === '' || v === undefined || (k === 'page' && v === 1) ? null : String(v);
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  reset(): void {
    this.filters = {};
    this.search();
  }

  /** A summary card filters the list to that plan's active members. */
  showActive(plan: MarketplacePlan): void {
    this.filters = { plan, status: 'active' };
    this.search();
  }

  export(): void {
    if (this.exporting() || !isPlatformBrowser(this.platformId)) return;
    this.exporting.set(true);
    this.marketplace.exportMembers(this.filters).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err: unknown) => {
        this.exporting.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'admin.members.exportFailed');
      },
    });
  }
}
