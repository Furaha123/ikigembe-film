import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ContractAcceptanceComponent } from './contract-acceptance.component';
import { ContractFlowService } from '../contract-flow.service';
import { AuthService } from '../../../../core/services/auth.service';
import { IDENTITY_DOCUMENT_MAX_BYTES } from '../../../../shared/models/upload.constants';

const file = (name: string, size = 2048, type = 'application/pdf') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

/** Picks a file the way the browser does: through the (hidden) file input. */
function choose(fixture: ComponentFixture<ContractAcceptanceComponent>, f: File) {
  const input = fixture.nativeElement.querySelector('#id-document') as HTMLInputElement;
  const transfer = new DataTransfer();
  transfer.items.add(f);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change'));
  fixture.detectChanges();
}

describe('ContractAcceptanceComponent', () => {
  let fixture: ComponentFixture<ContractAcceptanceComponent>;
  let cmp: ContractAcceptanceComponent;
  let flow: ContractFlowService;
  let router: Router;

  beforeEach(async () => {
    const auth = jasmine.createSpyObj('AuthService', ['getMe']);
    auth.getMe.and.returnValue(of({ first_name: 'Aline', last_name: 'Uwase' }));
    await TestBed.configureTestingModule({
      imports: [ContractAcceptanceComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: AuthService, useValue: auth }],
    }).compileComponents();

    flow = TestBed.inject(ContractFlowService);
    flow.reset();
    flow.agreement.set({ terms_version: 2, language: 'en', title: 'Agreement', sections: [], sha256: 'x' });
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    fixture = TestBed.createComponent(ContractAcceptanceComponent);
    cmp = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => flow.reset());

  function fillTheRest() {
    cmp.typedName.set('aline  uwase');
    cmp.agreed.set(true);
  }

  it('has no signature pad', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("can't be submitted without an identity document", () => {
    fillTheRest();
    expect(cmp.isValid()).toBeFalse();

    cmp.accept();
    expect(router.navigate).not.toHaveBeenCalledWith(['/producer/contracts/verifying']);
  });

  it('submits the document, its type and the typed name to the verifying step', () => {
    fillTheRest();
    cmp.setType('passport');
    choose(fixture, file('passport.pdf'));
    expect(cmp.isValid()).toBeTrue();

    cmp.accept();

    expect(flow.identityDocument()?.name).toBe('passport.pdf');
    expect(flow.identityDocumentType()).toBe('passport');
    expect(flow.signedName()).toBe('aline  uwase');
    expect(router.navigate).toHaveBeenCalledWith(['/producer/contracts/verifying']);
  });

  it('refuses other file types and files over the size limit', () => {
    choose(fixture, file('id.heic', 2048, 'image/heic'));
    expect(cmp.documentError()).toBe('type');
    expect(cmp.document()).toBeNull();

    choose(fixture, file('id.jpg', IDENTITY_DOCUMENT_MAX_BYTES + 1, 'image/jpeg'));
    expect(cmp.documentError()).toBe('size');
    expect(cmp.document()).toBeNull();

    choose(fixture, file('ID.PNG', 4096, 'image/png'));
    expect(cmp.documentError()).toBeNull();
    expect(cmp.previewUrl()).toMatch(/^blob:/);
  });

  it('can remove the chosen document', () => {
    choose(fixture, file('id.pdf'));
    cmp.removeDocument();
    fixture.detectChanges();
    expect(flow.identityDocument()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.drop-zone')).toBeTruthy();
  });
});
