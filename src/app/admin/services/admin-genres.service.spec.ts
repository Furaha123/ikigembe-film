import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AdminGenresService } from './admin-genres.service';

const BASE = `${environment.apiUrl}/admin/dashboard/genres`;

describe('AdminGenresService', () => {
  let service: AdminGenresService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminGenresService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the filters that are set', () => {
    service.list({ q: 'dra', status: '', page: 2, page_size: 25 }).subscribe(p => expect(p.total_results).toBe(1));
    const req = http.expectOne(r => r.url === `${BASE}/`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('dra');
    expect(req.request.params.has('status')).toBeFalse();
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ page: 2, page_size: 25, total_results: 1, total_pages: 1, results: [] });
  });

  it('creates, updates and deletes', () => {
    service.create({ name: 'Horror' }).subscribe();
    const create = http.expectOne(`${BASE}/`);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Horror' });
    create.flush({ id: 3, name: 'Horror' });

    service.update(3, { is_active: false }).subscribe();
    const update = http.expectOne(`${BASE}/3/`);
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ is_active: false });
    update.flush({ id: 3, name: 'Horror', is_active: false });

    service.remove(3).subscribe();
    const remove = http.expectOne(`${BASE}/3/`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('surfaces genre_in_use on delete', () => {
    let err: HttpErrorResponse | undefined;
    service.remove(1).subscribe({ error: e => (err = e) });
    http.expectOne(`${BASE}/1/`).flush(
      { error: '2 film(s) use "Drama".', code: 'genre_in_use', film_count: 2 },
      { status: 409, statusText: 'Conflict' },
    );
    expect(err?.status).toBe(409);
    expect(err?.error.code).toBe('genre_in_use');
  });
});
