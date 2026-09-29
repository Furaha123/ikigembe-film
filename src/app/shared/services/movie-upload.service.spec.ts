import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { MovieUploadService } from './movie-upload.service';

const BASE = `${environment.apiUrl}/movies/upload`;

describe('MovieUploadService', () => {
  let service: MovieUploadService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MovieUploadService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('api(field) initiates with that field_name and routes every step to /movies/upload/', () => {
    const api = service.api('trailer_file');
    api.initiate(new File(['x'], 't.mp4', { type: 'video/mp4' })).subscribe();
    api.signPart('u', 'k', 3).subscribe();
    api.complete('u', 'k', [{ PartNumber: 1, ETag: 'e' }]).subscribe();
    api.abort('u', 'k').subscribe();

    expect(http.expectOne(`${BASE}/initiate/`).request.body).toEqual({ file_name: 't.mp4', file_type: 'video/mp4', field_name: 'trailer_file' });
    expect(http.expectOne(`${BASE}/sign-part/`).request.body).toEqual({ upload_id: 'u', file_key: 'k', part_number: 3 });
    expect(http.expectOne(`${BASE}/complete/`).request.body).toEqual({ upload_id: 'u', file_key: 'k', parts: [{ PartNumber: 1, ETag: 'e' }] });
    expect(http.expectOne(`${BASE}/abort/`).request.body).toEqual({ upload_id: 'u', file_key: 'k' });
  });

  it('falls back to application/octet-stream when the browser gives no MIME type', () => {
    service.api('video_file').initiate(new File(['x'], 'film.mkv')).subscribe();
    expect(http.expectOne(`${BASE}/initiate/`).request.body.file_type).toBe('application/octet-stream');
  });
});
