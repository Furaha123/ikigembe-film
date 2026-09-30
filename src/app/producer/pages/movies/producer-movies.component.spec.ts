import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProducerMoviesComponent } from './producer-movies.component';
import { ProducerService } from '../../services/producer.service';
import { MultipartUploadService, UploadError } from '../../../shared/services/multipart-upload.service';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';

const pickEvent = (file: File) => ({ target: { files: [file] } }) as unknown as Event;
const settle = () => new Promise(r => setTimeout(r));

describe('ProducerMoviesComponent — resubmit uploads', () => {
  let fixture: ComponentFixture<ProducerMoviesComponent>;
  let c: ProducerMoviesComponent;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  let producer: jasmine.SpyObj<ProducerService>;

  beforeEach(() => {
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    producer = jasmine.createSpyObj<ProducerService>('ProducerService', ['getMovies', 'movieUploadApi']);
    producer.getMovies.and.returnValue(of([]));
    producer.movieUploadApi.and.returnValue({} as MultipartUploadApi);
    TestBed.configureTestingModule({
      imports: [ProducerMoviesComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ProducerService, useValue: producer },
        { provide: MultipartUploadService, useValue: uploader },
      ],
    });
    fixture = TestBed.createComponent(ProducerMoviesComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('rejects unsupported video types before uploading', () => {
    c.onRFilmSelect(pickEvent(new File(['x'], 'film.webm')));
    c.onRTrailerSelect(pickEvent(new File(['x'], 'trailer.exe')));
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(c.resubmitFilmError()).toBe('uploadErrors.videoType');
    expect(c.resubmitTrailerError()).toBe('uploadErrors.videoType');
  });

  it('accepts .MKV (case-insensitive) and uploads with field_name=video_file', () => {
    uploader.upload.and.resolveTo('movies/full/7/x.mkv');
    c.onRFilmSelect(pickEvent(new File(['x'], 'FILM.MKV')));
    expect(producer.movieUploadApi).toHaveBeenCalledWith('video_file');
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('shows the translated session-expired message on a 403 session error', async () => {
    uploader.upload.and.rejectWith(new UploadError('session', 403, 'This upload does not belong to your account.'));
    c.onRFilmSelect(pickEvent(new File(['x'], 'film.mp4')));
    await settle();
    expect(c.resubmitFilmError()).toBe('uploadErrors.sessionExpired');
    expect(c.isUploadingRFilm()).toBeFalse();
  });
});
