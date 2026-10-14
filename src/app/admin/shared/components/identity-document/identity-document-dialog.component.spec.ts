import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { IdentityDocumentDialogComponent } from './identity-document-dialog.component';
import { AdminService } from '../../../services/admin.service';
import { ContractIdentityDocument } from '../../../models/admin.interface';

const DOC: ContractIdentityDocument = {
  contract_id: 9, contract_version: 2, producer_id: 41, producer_email: 'aline@example.com',
  signed_name: 'Aline Uwase', signed_at: '2026-10-01T10:00:00Z', document_type: 'passport',
  format: 'pdf', url: 'https://private.test/contracts/identity/abc.pdf?sig=1', expires_in: 300,
};

describe('IdentityDocumentDialogComponent', () => {
  let fixture: ComponentFixture<IdentityDocumentDialogComponent>;
  let admin: jasmine.SpyObj<AdminService>;

  function open(doc: ContractIdentityDocument) {
    admin.getContractIdentityDocument.and.returnValue(of(doc));
    fixture = TestBed.createComponent(IdentityDocumentDialogComponent);
    fixture.componentInstance.contractId = doc.contract_id;
    fixture.componentInstance.producerName = 'Aline Uwase';
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    admin = jasmine.createSpyObj('AdminService', ['getContractIdentityDocument']);
    await TestBed.configureTestingModule({
      imports: [IdentityDocumentDialogComponent],
      providers: [provideTranslateService(), { provide: AdminService, useValue: admin }],
    }).compileComponents();
  });

  it('fetches a fresh link for the contract and shows who signed', () => {
    const el = open(DOC);
    expect(admin.getContractIdentityDocument).toHaveBeenCalledWith(9);
    expect(el.textContent).toContain('Aline Uwase');
    expect(el.textContent).toContain('aline@example.com');
    const link = el.querySelector('a.id-btn') as HTMLAnchorElement;
    expect(link.href).toBe(DOC.url);
    expect(link.rel).toContain('noopener');
    expect(el.querySelector('img')).toBeNull();
  });

  it('previews images and offers a new link when the old one expired', () => {
    const el = open({ ...DOC, format: 'image', url: 'https://private.test/contracts/identity/abc.jpg?sig=1' });
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('abc.jpg');

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    (el.querySelector('.id-retry') as HTMLButtonElement).click();
    expect(admin.getContractIdentityDocument).toHaveBeenCalledTimes(2);
  });
});
