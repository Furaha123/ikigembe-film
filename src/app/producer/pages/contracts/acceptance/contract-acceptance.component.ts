import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { ContractFlowService } from '../contract-flow.service';

@Component({
  selector: 'app-contract-acceptance',
  standalone: true,
  imports: [TranslatePipe, TranslateDirective],
  templateUrl: './contract-acceptance.component.html',
  styleUrl: './contract-acceptance.component.scss',
})
export class ContractAcceptanceComponent {
  private readonly router = inject(Router);
  readonly flow = inject(ContractFlowService);

  agreed             = signal(false);
  signaturePhoto     = signal<File | null>(null);
  signaturePreview   = signal<string | null>(null);
  signatureError     = signal<string | null>(null);

  isValid = computed(() => this.agreed() && !!this.signaturePhoto());

  onSignatureSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.signatureError.set('producerUi.common.imageTypeInvalid');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.signatureError.set('producerUi.common.imageTooLarge');
      return;
    }
    this.signatureError.set(null);
    this.signaturePhoto.set(file);
    const reader = new FileReader();
    reader.onload = (e) => this.signaturePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  removeSignature() {
    this.signaturePhoto.set(null);
    this.signaturePreview.set(null);
  }

  back()     { this.router.navigate(['/producer/contracts/warning']); }
  accept() {
    if (!this.isValid()) return;
    this.flow.signaturePhoto.set(this.signaturePhoto());
    this.router.navigate(['/producer/contracts/verifying']);
  }
}
