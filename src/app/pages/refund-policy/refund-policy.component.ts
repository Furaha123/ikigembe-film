import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../core/services/seo.service';

/**
 * Built-in refund policy, shown at /refund-policy when no CMS page "refund-policy" exists. It describes
 * the refund process the platform actually runs (admin review, provider or manual return, confirmation
 * before anything counts as refunded) and promises nothing beyond it. Legal review pending — an admin
 * can replace it any time with a CMS page.
 */
@Component({
  selector: 'app-refund-policy',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './refund-policy.component.html',
  styleUrl: '../terms/terms.component.scss',
})
export class RefundPolicyComponent implements OnInit {
  private readonly seo = inject(SeoService);
  readonly sections = ['scope', 'when', 'request', 'how', 'effects', 'marketplace', 'status'] as const;

  ngOnInit(): void {
    this.seo.setTranslated({ titleKey: 'refundPolicy.title', descriptionKey: 'refundPolicy.intro' });
  }
}
