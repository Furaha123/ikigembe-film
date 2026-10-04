import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile } from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { RETURN_URL_PARAM, safeReturnUrl } from '../../../shared/utils/safe-redirect';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { ActorProfileFormComponent } from './actor-profile-form.component';


/** The actor's own profile. GET answers 404 until it exists: that is the "create" state, not an error. */
@Component({
  selector: 'app-actor-profile',
  standalone: true,
  imports: [TranslatePipe, HeaderComponent, FooterComponent, MarketplaceNavComponent, ActorProfileFormComponent],
  templateUrl: './actor-profile.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorProfileComponent implements OnInit, HasUnsavedChanges {
  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formRef = viewChild(ActorProfileFormComponent);

  loading = signal(true);
  profile = signal<ActorProfile | null>(null);
  saved   = signal(false);
  error   = signal<string | null>(null);

  /** Where to continue after saving (e.g. back to a casting call), if it is a safe in-app path. */
  readonly returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get(RETURN_URL_PARAM));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.getProfile().subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        if (err.status !== 404) this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  onSaved(p: ActorProfile): void {
    this.profile.set(p);
    this.saved.set(true);
    if (this.returnUrl) void this.router.navigateByUrl(this.returnUrl);
  }

  hasUnsavedChanges(): boolean {
    return this.formRef()?.hasUnsavedChanges() ?? false;
  }
}
