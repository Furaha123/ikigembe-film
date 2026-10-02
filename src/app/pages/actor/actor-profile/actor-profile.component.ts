import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../actor-nav/actor-nav.component';
import { ActorProfileFormComponent } from '../actor-profile-form/actor-profile-form.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile } from '../../../shared/models/marketplace.interface';
import { apiErrorMessage } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-actor-profile',
  standalone: true,
  imports: [RouterLink, TranslatePipe, HeaderComponent, FooterComponent, ActorNavComponent, ActorProfileFormComponent],
  templateUrl: './actor-profile.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorProfileComponent implements OnInit {
  private readonly marketplace = inject(ActorMarketplaceService);

  loading = signal(true);
  profile = signal<ActorProfile | null>(null);
  saved   = signal(false);
  error   = signal<string | null>(null);

  ngOnInit(): void {
    this.marketplace.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status !== 404) this.error.set(apiErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  onSaved(p: ActorProfile): void {
    this.profile.set(p);
    this.saved.set(true);
  }
}
