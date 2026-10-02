import { Component, inject, signal, OnInit, ElementRef, ViewChild, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';
import { ContractService } from '../../../services/contract.service';
import { apiErrorMessage } from '../../../../shared/utils/api-error';

@Component({
  selector: 'app-contract-review',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './contract-review.component.html',
  styleUrl: './contract-review.component.scss',
})
export class ContractReviewComponent implements OnInit {
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
  private readonly contractService = inject(ContractService);
  readonly flow = inject(ContractFlowService);

  @ViewChild('scrollBody') scrollBody?: ElementRef<HTMLElement>;

  loading             = signal(false);
  loadError           = signal<string | null>(null);
  hasScrolledToBottom = signal(false);

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    const loaded = this.flow.agreement();
    if (loaded && loaded.language === this.flow.selectedLanguage()) {
      this.afterRender();
      return;
    }
    this.load();
  }

  load() {
    this.loading.set(true);
    this.loadError.set(null);
    this.flow.agreement.set(null);
    this.contractService.getAgreement(this.flow.selectedLanguage()).subscribe({
      next: agreement => {
        this.flow.agreement.set(agreement);
        this.loading.set(false);
        this.afterRender();
      },
      error: err => {
        this.loadError.set(apiErrorMessage(err) ?? '');
        this.loading.set(false);
      },
    });
  }

  onScroll(event: Event) {
    this.checkScrolled(event.target as HTMLElement);
  }

  downloadPdf() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.print();
  }

  back()     { this.router.navigate(['/producer/contracts/language']); }
  continue() {
    if (this.hasScrolledToBottom() && this.flow.agreement()) {
      this.router.navigate(['/producer/contracts/warning']);
    }
  }

  // A short text (or a tall screen) never scrolls, so check once it has rendered.
  private afterRender() {
    setTimeout(() => {
      if (this.scrollBody) this.checkScrolled(this.scrollBody.nativeElement);
    });
  }

  private checkScrolled(el: HTMLElement) {
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) this.hasScrolledToBottom.set(true);
  }
}
