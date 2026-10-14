import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminService } from '../../../services/admin.service';
import { ContractIdentityDocument } from '../../../models/admin.interface';
import { apiErrorMessage } from '../../../../shared/utils/api-error';
import { ModalBackdropDirective } from '../../../../shared/directives/modal-backdrop.directive';

/**
 * The National ID / passport a producer uploaded to sign a contract, with who signed.
 * Each open fetches a fresh short-lived link (the API audit-logs it); the link stays in
 * this component only. PDFs open in a new tab rather than an embedded frame.
 */
@Component({
  selector: 'app-identity-document-dialog',
  standalone: true,
  imports: [ModalBackdropDirective, DatePipe, TranslatePipe],
  templateUrl: './identity-document-dialog.component.html',
  styleUrl: './identity-document-dialog.component.scss',
})
export class IdentityDocumentDialogComponent implements OnInit {
  @Input({ required: true }) contractId!: number;
  @Input() producerName = '';
  @Output() closed = new EventEmitter<void>();

  private readonly admin = inject(AdminService);

  doc       = signal<ContractIdentityDocument | null>(null);
  loading   = signal(true);
  error     = signal<string | null>(null);

  ngOnInit() {
    this.load();
  }

  /** Each call is a new audited view with a new link (e.g. after the last one expired). */
  load() {
    this.loading.set(true);
    this.error.set(null);
    this.doc.set(null);
    this.admin.getContractIdentityDocument(this.contractId).subscribe({
      next: doc => { this.doc.set(doc); this.loading.set(false); },
      error: (err: unknown) => {
        this.error.set(apiErrorMessage(err) ?? 'admin.identityDocument.loadFailed');
        this.loading.set(false);
      },
    });
  }

  /** The link expired or the file is unreadable: offer a new link. */
  imageFailed() {
    this.doc.set(null);
    this.error.set('admin.identityDocument.loadFailed');
  }

  typeLabel(type: string): string {
    return type === 'passport' ? 'admin.contractsPage.typePassport' : 'admin.contractsPage.typeNationalId';
  }
}
