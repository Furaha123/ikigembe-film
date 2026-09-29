import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ProducerService } from './producer.service';

const BASE = environment.apiUrl;

describe('ProducerService', () => {
  let service: ProducerService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ProducerService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProducerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('movieUploadApi()', () => {
    it('initiates with the bound field_name (copyright_document)', () => {
      const file = new File(['%PDF'], 'rights.pdf', { type: 'application/pdf' });
      service.movieUploadApi('copyright_document').initiate(file).subscribe();

      const req = http.expectOne(`${BASE}/movies/upload/initiate/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ file_name: 'rights.pdf', file_type: 'application/pdf', field_name: 'copyright_document' });
      req.flush({ upload_id: 'u', file_key: 'movies/copyright/x.pdf' });
    });

    it('routes sign-part, complete and abort to the movie multipart endpoints', () => {
      const api = service.movieUploadApi('video_file');
      api.signPart('u', 'k', 2).subscribe();
      api.complete('u', 'k', [{ PartNumber: 1, ETag: 'e' }]).subscribe();
      api.abort('u', 'k').subscribe();

      const sign = http.expectOne(`${BASE}/movies/upload/sign-part/`);
      expect(sign.request.body).toEqual({ upload_id: 'u', file_key: 'k', part_number: 2 });
      sign.flush({ url: 'x' });
      const complete = http.expectOne(`${BASE}/movies/upload/complete/`);
      expect(complete.request.body).toEqual({ upload_id: 'u', file_key: 'k', parts: [{ PartNumber: 1, ETag: 'e' }] });
      complete.flush({});
      const abort = http.expectOne(`${BASE}/movies/upload/abort/`);
      expect(abort.request.body).toEqual({ upload_id: 'u', file_key: 'k' });
      abort.flush({});
    });
  });

  describe('resubmitFilmFiles()', () => {
    const url = `${BASE}/producer/films/7/resubmit/`;

    it('POSTs the new keys as JSON to /producer/films/<id>/resubmit/', () => {
      service.resubmitFilmFiles(7, { video_key: 'movies/full/v.mp4', copyright_document_key: 'movies/copyright/c.pdf' }).subscribe();

      const req = http.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ video_key: 'movies/full/v.mp4', copyright_document_key: 'movies/copyright/c.pdf' });
      req.flush({ id: 7, approval_status: 'pending_review' });
    });

    const cases: [number, string][] = [
      [400, 'copyright_document_key must be uploaded with field_name=copyright_document.'],
      [404, 'Film not found'],
      [409, 'Resubmit is only available when changes have been requested by the admin.'],
    ];
    for (const [status, message] of cases) {
      it(`surfaces ${status} with the backend message`, () => {
        let err: HttpErrorResponse | undefined;
        service.resubmitFilmFiles(7, { video_key: 'k' }).subscribe({ error: e => (err = e) });

        http.expectOne(url).flush({ error: message }, { status, statusText: 'Error' });

        expect(err?.status).toBe(status);
        expect(err?.error).toEqual({ error: message });
      });
    }
  });
});
