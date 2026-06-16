import { Component, inject, signal, AfterViewInit, ElementRef, ViewChild, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';
import { CONTRACT_TEXT_EN, CONTRACT_TEXT_RW } from './contract-text';

@Component({
  selector: 'app-contract-review',
  standalone: true,
  imports: [TranslatePipe, TranslateDirective],
  templateUrl: './contract-review.component.html',
  styleUrl: './contract-review.component.scss',
})
export class ContractReviewComponent implements AfterViewInit {
  private readonly router     = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  readonly flow = inject(ContractFlowService);

  @ViewChild('scrollBody') scrollBody!: ElementRef<HTMLElement>;

  hasScrolledToBottom = signal(false);

  get contractText() {
    return this.flow.selectedLanguage() === 'rw' ? CONTRACT_TEXT_RW : CONTRACT_TEXT_EN;
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    // Redirect if user landed here directly without a language selected
    if (!this.flow.selectedLanguage()) {
      this.router.navigate(['/producer/contracts/language']);
    }
  }

  onScroll(event: Event) {
    const el = event.target as HTMLElement;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom) this.hasScrolledToBottom.set(true);
  }

  downloadPdf() {
    if (!isPlatformBrowser(this.platformId)) return;
    window.print();
  }

  back()     { this.router.navigate(['/producer/contracts/language']); }
  continue() {
    if (this.hasScrolledToBottom()) {
      this.router.navigate(['/producer/contracts/warning']);
    }
  }
}
