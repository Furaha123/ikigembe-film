import { Component, inject, signal, computed, OnInit, ViewChild, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { ContractFlowService } from '../contract-flow.service';
import { SignaturePadComponent } from '../signature-pad/signature-pad.component';

const normalizeName = (name: string) => name.trim().split(/\s+/).join(' ').toLocaleLowerCase();

/**
 * Signing step: draw a signature, type the full legal name on the account, agree.
 * The API re-checks all three and records them with the exact terms shown.
 */
@Component({
  selector: 'app-contract-acceptance',
  standalone: true,
  imports: [TranslatePipe, RouterLink, SignaturePadComponent],
  templateUrl: './contract-acceptance.component.html',
  styleUrl: './contract-acceptance.component.scss',
})
export class ContractAcceptanceComponent implements OnInit {
  private readonly router      = inject(Router);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  readonly flow = inject(ContractFlowService);

  @ViewChild(SignaturePadComponent) private pad?: SignaturePadComponent;

  agreed      = signal(false);
  hasInk      = signal(false);
  typedName   = signal('');
  /**
   * Full name on the account: undefined while loading, '' when it has none (signing is
   * blocked until it's added), null when it couldn't be loaded (the API checks it).
   */
  accountName = signal<string | null | undefined>(undefined);
  submitting  = signal(false);

  nameMatches = computed(() => {
    const account = this.accountName();
    const typed = normalizeName(this.typedName());
    if (account === null) return typed.length > 1;
    return !!account && typed === normalizeName(account);
  });
  showNameMismatch = computed(() => this.typedName().trim().length > 0 && !this.nameMatches());
  isValid = computed(() => this.agreed() && this.hasInk() && this.nameMatches() && !this.submitting());

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.flow.agreement()) {
      this.router.navigate(['/producer/contracts/review'], { replaceUrl: true });
      return;
    }
    this.authService.getMe().subscribe({
      next: me => this.accountName.set(`${me.first_name ?? ''} ${me.last_name ?? ''}`.trim()),
      // Can't check locally; let the API decide.
      error: () => this.accountName.set(null),
    });
  }

  back() {
    this.router.navigate([this.flow.signDeadline() ? '/producer/contracts/warning' : '/producer/contracts/review']);
  }

  async accept() {
    if (!this.isValid() || !this.pad) return;
    this.submitting.set(true);
    try {
      this.flow.signature.set(await this.pad.toBlob());
    } catch {
      this.submitting.set(false);
      return;
    }
    this.flow.signedName.set(this.typedName().trim());
    this.router.navigate(['/producer/contracts/verifying']);
  }
}
