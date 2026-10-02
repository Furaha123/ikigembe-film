import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { AuthService } from '../../../core/services/auth.service';
import { MAX_TALENT_VIDEO_SECONDS } from '../../../shared/models/upload.constants';

/**
 * Public casting landing ("Choose your path"). Actors show their talent or
 * browse casting calls; producers post calls and search the actor directory.
 * Links depend on the visitor: guests sign up first, viewers become producers
 * from their profile.
 */
@Component({
  selector: 'app-casting-start',
  standalone: true,
  imports: [RouterLink, TranslatePipe, HeaderComponent, FooterComponent],
  templateUrl: './casting-start.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss', './casting-start.component.scss'],
})
export class CastingStartComponent {
  private readonly auth = inject(AuthService);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly maxMinutes = MAX_TALENT_VIDEO_SECONDS / 60;

  readonly isProducer = computed(() => this.isLoggedIn() && this.auth.userRole() === 'Producer');

  /** Where "Producer casting" leads for this visitor. */
  readonly producerLink = computed(() => {
    if (this.isProducer()) return '/producer/casting';
    return this.isLoggedIn() ? '/profile' : '/register';
  });

  readonly producerCtaKey = computed(() => {
    if (this.isProducer()) return 'marketplace.start.producerCta';
    return this.isLoggedIn() ? 'marketplace.start.becomeProducer' : 'marketplace.start.signUp';
  });
}
