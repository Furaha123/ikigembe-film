import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { CastingApplication } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { applicationStatusClass } from '../../../shared/utils/marketplace-status';

@Component({
  selector: 'app-my-applications',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent],
  templateUrl: './my-applications.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class MyApplicationsComponent implements OnInit {
  private readonly marketplace = inject(ActorMarketplaceService);

  applications = signal<CastingApplication[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);

  readonly statusClass = applicationStatusClass;

  ngOnInit(): void {
    this.marketplace.getMyApplications().subscribe({
      next: (list) => { this.applications.set(list); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }
}
