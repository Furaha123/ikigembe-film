import { Component, OnInit, inject } from '@angular/core';

import { SeoService } from '../../core/services/seo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-terms',
  imports: [TranslatePipe],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss'
})
export class TermsComponent implements OnInit {
  private seo = inject(SeoService);
  private translate = inject(TranslateService);
  ngOnInit() {
    this.seo.set({ title: this.translate.instant('terms.seoTitle'), description: this.translate.instant('terms.seoDescription') });
  }
}
