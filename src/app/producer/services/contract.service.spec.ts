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

  it('signs with the drawn signature, typed name and the exact terms shown', () => {
    const signature = new Blob(['png'], { type: 'image/png' });
    service.sign({ signature, signedName: 'Aline Uwase', language: 'en', termsVersion: 3 }).subscribe();

    const req = http.expectOne(`${BASE}/contracts/sign/`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect((body.get('signature') as File).name).toBe('signature.png');
    expect(body.get('signed_name')).toBe('Aline Uwase');
    expect(body.get('language')).toBe('en');
    expect(body.get('terms_version')).toBe('3');
    expect(body.get('agreed')).toBe('true');
    expect(body.has('signature_photo')).toBeFalse();
    req.flush({});
  });
});
