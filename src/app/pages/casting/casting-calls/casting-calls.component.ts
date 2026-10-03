import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../../actor/actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { CastingCall } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { castingDisplayStatus, castingCallStatusClass } from '../../../shared/utils/marketplace-status';

@Component({
  selector: 'app-casting-calls',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent],
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
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }
}
