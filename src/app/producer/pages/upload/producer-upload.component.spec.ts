import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ProducerUploadComponent } from './producer-upload.component';
import { MultipartUploadService, UploadAbortedError, UploadError } from '../../../shared/services/multipart-upload.service';
import { ProducerService } from '../../services/producer.service';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';

const pickEvent = (file: File) => ({ target: { files: [file] } }) as unknown as Event;
const settle = () => new Promise(r => setTimeout(r));

describe('ProducerUploadComponent — file types (no HTTP for rejected files)', () => {
  let fixture: ComponentFixture<ProducerUploadComponent>;
  let c: ProducerUploadComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    // Real services + HTTP testing backend: a rejected file must never reach the API.
    TestBed.configureTestingModule({
      imports: [ProducerUploadComponent],
      providers: [provideRouter([]), provideTranslateService(), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProducerUploadComponent);
    c = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  for (const name of ['clip.webm', 'setup.exe', 'notes.docx']) {
    it(`rejects ${name} for the film without calling the API`, async () => {
      c.onMovieSelect(pickEvent(new File(['x'], name)));
      await settle();
      http.expectNone(() => true);
      expect(c.movieErrors()).toEqual(['uploadErrors.videoType']);
      expect(c.movieFile()).toBeNull();
    });
  }

  it('rejects a .webm trailer and a .docx copyright document without calling the API', async () => {
    c.onTrailerSelect(pickEvent(new File(['x'], 'trailer.webm')));
    c.onCopyrightSelect(pickEvent(new File(['x'], 'rights.docx')));
    await settle();
    http.expectNone(() => true);
    expect(c.trailerUploadError()).toBe('uploadErrors.videoType');
    expect(c.copyrightError()).toBe('uploadErrors.documentType');
  });

  it('accepts allowed types regardless of case (MOVIE.MP4) and starts the multipart upload', () => {
    c.onMovieSelect(pickEvent(new File(['x'], 'MOVIE.MP4', { type: 'video/mp4' })));
    const req = http.expectOne(r => r.url.endsWith('/movies/upload/initiate/'));
    expect(req.request.body.field_name).toBe('video_file');
    expect(c.movieErrors()).toEqual([]);
  });
});

describe('ProducerUploadComponent — upload session errors', () => {
  it('shows the translated session-expired message', async () => {
    const uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    uploader.upload.and.rejectWith(new UploadError('session', 403, 'This upload does not belong to your account.'));
    const producer = jasmine.createSpyObj<ProducerService>('ProducerService', ['movieUploadApi']);
    producer.movieUploadApi.and.returnValue({} as MultipartUploadApi);
    TestBed.configureTestingModule({
      imports: [ProducerUploadComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: MultipartUploadService, useValue: uploader },
        { provide: ProducerService, useValue: producer },
      ],
    });
    const fixture = TestBed.createComponent(ProducerUploadComponent);
    const c = fixture.componentInstance;
    fixture.detectChanges();

    c.onMovieSelect(pickEvent(new File(['x'], 'film.mp4', { type: 'video/mp4' })));
    await settle();

    expect(c.movieUploadError()).toBe('uploadErrors.sessionExpired');
    expect(c.isUploadingMovie()).toBeFalse();
    expect(uploader.upload).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it('stays silent when the upload was cancelled', async () => {
    const uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    uploader.upload.and.rejectWith(new UploadAbortedError());
    TestBed.configureTestingModule({
      imports: [ProducerUploadComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: MultipartUploadService, useValue: uploader },
        { provide: ProducerService, useValue: { movieUploadApi: () => ({}) } },
      ],
    });
    const c = TestBed.createComponent(ProducerUploadComponent).componentInstance;
    c.onMovieSelect(pickEvent(new File(['x'], 'film.mp4')));
    await settle();
    expect(c.movieUploadError()).toBeNull();
  });
});

