import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { CastingCall } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { castingDisplayStatus, castingCallStatusClass } from '../../../shared/utils/marketplace-status';

@Component({
  selector: 'app-casting-calls',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, MarketplaceNavComponent],
  templateUrl: './casting-calls.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class CastingCallsComponent implements OnInit {
  readonly displayStatus = castingDisplayStatus;
  readonly statusClass = castingCallStatusClass;
  private readonly marketplace = inject(ActorMarketplaceService);

  calls      = signal<CastingCall[]>([]);
  page       = signal(1);
  totalPages = signal(0);
  total      = signal(0);
  loading    = signal(true);
  error      = signal<string | null>(null);

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.getCastingCalls(page).subscribe({
      next: (res) => {
        this.calls.set(res.results);
        this.page.set(res.page);
        this.totalPages.set(res.total_pages);
        this.total.set(res.total_results);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }
}
