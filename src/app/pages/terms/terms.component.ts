import { Component, OnInit, inject } from '@angular/core';

import { SeoService } from '../../core/services/seo.service';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-terms',
  imports: [TranslatePipe],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss'
})
export class TermsComponent implements OnInit {
  private seo = inject(SeoService);
  ngOnInit() {
    this.seo.setTranslated({ titleKey: 'terms.seoTitle', descriptionKey: 'terms.seoDescription' });
  }
}
