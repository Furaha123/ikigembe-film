import { Component, inject, signal, computed, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { ContractFlowService } from '../contract-flow.service';
import { IdentityDocumentType } from '../../../services/contract.service';
import {
  ALLOWED_DOCUMENT_EXTENSIONS, DOCUMENT_ACCEPT, IDENTITY_DOCUMENT_MAX_BYTES, hasAllowedExtension,
} from '../../../../shared/models/upload.constants';
import { formatFileSize } from '../../../../shared/utils/talent-video';

const normalizeName = (name: string) => name.trim().split(/\s+/).join(' ').toLocaleLowerCase();

type DocumentError = 'type' | 'size' | 'empty';

/**
 * Signing step: upload a copy of the National ID or passport, type the full legal name
 * on the account, agree. The API re-checks all of them (the document by its content) and
 * records them with the exact terms shown.
 */
@Component({
  selector: 'app-contract-acceptance',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './contract-acceptance.component.html',
  styleUrl: './contract-acceptance.component.scss',
})
export class ContractAcceptanceComponent implements OnInit, OnDestroy {
  private readonly router      = inject(Router);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);
  readonly flow = inject(ContractFlowService);

  readonly documentAccept = DOCUMENT_ACCEPT;
  readonly maxSizeLabel   = formatFileSize(IDENTITY_DOCUMENT_MAX_BYTES);
  readonly formatSize     = formatFileSize;

  agreed      = signal(false);
  typedName   = signal('');
  /** Kept in the flow so going back (or a failed submit) doesn't lose it. */
  document    = this.flow.identityDocument;
  documentType = this.flow.identityDocumentType;
  documentError = signal<DocumentError | null>(null);
  /** Object URL for an image preview; PDFs show an icon. */
  previewUrl  = signal<string | null>(null);
  dragging    = signal(false);
  /**
   * Full name on the account: undefined while loading, '' when it has none (signing is
   * blocked until it's added), null when it couldn't be loaded (the API checks it).
   */
  accountName = signal<string | null | undefined>(undefined);
  submitting  = signal(false);

  isPdf = computed(() => this.document()?.name.toLowerCase().endsWith('.pdf') ?? false);
  nameMatches = computed(() => {
    const account = this.accountName();
    const typed = normalizeName(this.typedName());
    if (account === null) return typed.length > 1;
    return !!account && typed === normalizeName(account);
  });
  showNameMismatch = computed(() => this.typedName().trim().length > 0 && !this.nameMatches());
  isValid = computed(() => this.agreed() && !!this.document() && this.nameMatches() && !this.submitting());

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.flow.agreement()) {
      this.router.navigate(['/producer/contracts/review'], { replaceUrl: true });
      return;
    }
    this.typedName.set(this.flow.signedName());
    this.updatePreview(this.document());
    this.authService.getMe().subscribe({
      next: me => this.accountName.set(`${me.first_name ?? ''} ${me.last_name ?? ''}`.trim()),
      // Can't check locally; let the API decide.
      error: () => this.accountName.set(null),
    });
  }

  ngOnDestroy() {
    this.revokePreview();
  }

  setType(type: IdentityDocumentType) {
    this.documentType.set(type);
  }

  onFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.pick(input.files?.[0] ?? null);
    // Choosing the same file again after removing it must fire `change` again.
    input.value = '';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);
    this.pick(event.dataTransfer?.files?.[0] ?? null);
  }

  removeDocument() {
    this.document.set(null);
    this.documentError.set(null);
    this.updatePreview(null);
  }

  back() {
    this.flow.signedName.set(this.typedName().trim());
    this.router.navigate([this.flow.signDeadline() ? '/producer/contracts/warning' : '/producer/contracts/review']);
  }

  accept() {
    if (!this.isValid()) return;
    this.submitting.set(true);
    this.flow.signedName.set(this.typedName().trim());
    this.router.navigate(['/producer/contracts/verifying']);
  }

  /** Early checks only (the API checks the content): type by extension, size. */
  private pick(file: File | null) {
    if (!file) return;
    let error: DocumentError | null = null;
    if (!hasAllowedExtension(file.name, ALLOWED_DOCUMENT_EXTENSIONS)) error = 'type';
    else if (file.size === 0) error = 'empty';
    else if (file.size > IDENTITY_DOCUMENT_MAX_BYTES) error = 'size';
    this.documentError.set(error);
    if (error) return;
    this.document.set(file);
    this.updatePreview(file);
  }

  private updatePreview(file: File | null) {
    this.revokePreview();
    if (file && !file.name.toLowerCase().endsWith('.pdf') && isPlatformBrowser(this.platformId)) {
      this.previewUrl.set(URL.createObjectURL(file));
    }
  }

  private revokePreview() {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }
}
