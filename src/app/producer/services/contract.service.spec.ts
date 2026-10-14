import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ContractService } from './contract.service';

const BASE = environment.apiUrl;

describe('ContractService', () => {
  let service: ContractService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ContractService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContractService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the agreement text in the chosen language', () => {
    service.getAgreement('rw').subscribe();

    const req = http.expectOne(r => r.url === `${BASE}/contracts/agreement/`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('language')).toBe('rw');
    req.flush({ terms_version: 1, language: 'rw', title: 't', sections: [], sha256: 'x' });
  });

  it('signs with the identity document, typed name and the exact terms shown', () => {
    const identityDocument = new File(['%PDF-1.4'], 'passport.pdf', { type: 'application/pdf' });
    service.sign({
      identityDocument, identityDocumentType: 'passport', signedName: 'Aline Uwase', language: 'en', termsVersion: 3,
    }).subscribe();

    const req = http.expectOne(`${BASE}/contracts/sign/`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect((body.get('identity_document') as File).name).toBe('passport.pdf');
    expect(body.get('identity_document_type')).toBe('passport');
    expect(body.get('signed_name')).toBe('Aline Uwase');
    expect(body.get('language')).toBe('en');
    expect(body.get('terms_version')).toBe('3');
    expect(body.get('agreed')).toBe('true');
    expect(body.has('signature')).toBeFalse();
    req.flush({});
  });
});
