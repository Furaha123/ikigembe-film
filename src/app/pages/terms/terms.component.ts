import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-terms',
  imports: [RouterLink],
  templateUrl: './terms.component.html',
  styleUrl: './terms.component.scss'
})
export class TermsComponent implements OnInit {
  private seo = inject(SeoService);
  ngOnInit() {
    this.seo.set({ title: 'Terms & Conditions', description: 'Read the Ikigembe terms and conditions for viewers and producers.' });
  }
}
