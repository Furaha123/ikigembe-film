import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminMovieFormComponent } from './admin-movie-form.component';
import { AdminService } from '../../services/admin.service';
import { MovieService } from '../../../shared/services/movie.service';
import { MovieUploadService } from '../../../shared/services/movie-upload.service';
import { MultipartUploadService, UploadError } from '../../../shared/services/multipart-upload.service';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';
import { MovieDetailResponse } from '../../../shared/models/movie-api.interface';
import { ProducerItem } from '../../models/admin.interface';

const PRODUCER = { id: 42, name: 'Aline M.', studio_name: 'Gasabo Films' } as ProducerItem;

describe('AdminMovieFormComponent (film upload)', () => {
  let fixture: ComponentFixture<AdminMovieFormComponent>;
  let c: AdminMovieFormComponent;
  let admin: jasmine.SpyObj<AdminService>;
  let movieUpload: jasmine.SpyObj<MovieUploadService>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  const videoApi = { id: 'video' } as unknown as MultipartUploadApi;
  const trailerApi = { id: 'trailer' } as unknown as MultipartUploadApi;

  const el = () => fixture.nativeElement as HTMLElement;
  const settle = () => new Promise(r => setTimeout(r));
  const pick = (id: string, file: File) => {
    const input = el().querySelector<HTMLInputElement>(id)!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const videoFile = new File(['v'], 'film.mp4', { type: 'video/mp4' });
  const thumb = new File(['i'], 'poster.jpg', { type: 'image/jpeg' });

  const routeStub = { snapshot: { paramMap: convertToParamMap({}) } };

  const create = (editId?: string) => {
    routeStub.snapshot.paramMap = convertToParamMap(editId ? { id: editId } : {});
    fixture = TestBed.createComponent(AdminMovieFormComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  };

  const fillRequired = () => c.form.patchValue({ title: 'Umurage', overview: 'A story', release_date: '2026-09-01', producer: '42' });

  beforeEach(() => {
    admin = jasmine.createSpyObj<AdminService>('AdminService', ['getProducers', 'createMovie', 'updateMovie']);
    admin.getProducers.and.returnValue(of([PRODUCER]));
    admin.createMovie.and.returnValue(of({}));
    admin.updateMovie.and.returnValue(of({}));
    movieUpload = jasmine.createSpyObj<MovieUploadService>('MovieUploadService', ['api']);
    movieUpload.api.and.callFake(field => (field === 'video_file' ? videoApi : trailerApi));
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    uploader.upload.and.callFake((_f, api) => Promise.resolve(api === videoApi ? 'movies/full/abc.mp4' : 'movies/trailers/t.mp4'));
    const movies = jasmine.createSpyObj<MovieService>('MovieService', ['getMovieDetails']);
    movies.getMovieDetails.and.returnValue(of({
      id: 7, title: 'Old', overview: 'o', release_date: '2025-01-01', price: 500, producer_profile: { id: 42, name: 'Aline M.' },
    } as unknown as MovieDetailResponse));

    TestBed.configureTestingModule({
      imports: [AdminMovieFormComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: AdminService, useValue: admin },
        { provide: MovieService, useValue: movies },
        { provide: MovieUploadService, useValue: movieUpload },
        { provide: MultipartUploadService, useValue: uploader },
      ],
    });
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
  });

  it('uploads the video through the multipart flow with field_name=video_file as soon as it is picked', async () => {
    create();
    pick('#f-video', videoFile);
    await settle();
    expect(movieUpload.api).toHaveBeenCalledWith('video_file');
    expect(uploader.upload).toHaveBeenCalledOnceWith(videoFile, videoApi, jasmine.objectContaining({ signal: jasmine.any(AbortSignal) }));
    expect(c.video().key).toBe('movies/full/abc.mp4');
  });

  it('creates the film with video_key/trailer_key — never the raw video file', async () => {
    create();
    fillRequired();
    pick('#f-thumbnail', thumb);
    pick('#f-video', videoFile);
    pick('#f-trailer', new File(['t'], 'trailer.mp4', { type: 'video/mp4' }));
    await settle();

    c.save();

    const fd = admin.createMovie.calls.mostRecent().args[0];
    expect(fd.get('video_key')).toBe('movies/full/abc.mp4');
    expect(fd.get('trailer_key')).toBe('movies/trailers/t.mp4');
    expect(fd.has('video_file')).toBeFalse();
    expect(fd.has('trailer_file')).toBeFalse();
    expect((fd.get('thumbnail') as File).name).toBe('poster.jpg');
    expect(movieUpload.api).toHaveBeenCalledWith('trailer_file');
  });

  it('links the producer account (producer_profile) and keeps the display name', async () => {
    create();
    fillRequired();
    pick('#f-thumbnail', thumb);
    pick('#f-video', videoFile);
    await settle();
    c.save();
    const fd = admin.createMovie.calls.mostRecent().args[0];
    expect(fd.get('producer_profile')).toBe('42');
    expect(fd.get('producer')).toBe('Gasabo Films');
  });

  it('requires the thumbnail and a finished video upload before publishing', () => {
    create();
    fillRequired();
    c.save();
    expect(admin.createMovie).not.toHaveBeenCalled();
    expect(c.filesError()).toEqual({ thumbnail: 'admin.movieForm.errors.thumbnailRequired', video: 'admin.movieForm.errors.videoRequired' });
  });

  it('blocks saving while an upload is still running', () => {
    uploader.upload.and.returnValue(new Promise<string>(() => {}));
    create();
    fillRequired();
    pick('#f-thumbnail', thumb);
    pick('#f-video', videoFile);
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBeTrue();
    c.save();
    expect(admin.createMovie).not.toHaveBeenCalled();
  });

  it('shows an upload error and retries', async () => {
    uploader.upload.and.rejectWith(new Error('Part 1 failed (500)'));
    create();
    pick('#f-video', videoFile);
    await settle();
    fixture.detectChanges();
    expect(c.video().error).toBe('admin.movieForm.errors.uploadFailed');

    uploader.upload.and.resolveTo('movies/full/abc.mp4');
    el().querySelector<HTMLButtonElement>('.upload-retry')!.click();
    await settle();
    expect(c.video().key).toBe('movies/full/abc.mp4');
  });

  it('removing a file mid-upload cancels it', () => {
    let signal: AbortSignal | undefined;
    uploader.upload.and.callFake((_f, _a, opts) => { signal = opts?.signal; return new Promise<string>(() => {}); });
    create();
    pick('#f-video', videoFile);
    c.removeVideo('video');
    expect(signal?.aborted).toBeTrue();
    expect(c.video().file).toBeNull();
  });

  it('rejects non-video files', () => {
    create();
    pick('#f-video', new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(c.video().error).toBe('uploadErrors.videoType');
  });

  it('edit mode: prefills the producer from producer_profile and only sends a new video_key when replaced', async () => {
    create('7');
    expect(c.form.value.producer).toBe('42');
    c.save();
    let fd = admin.updateMovie.calls.mostRecent().args[1];
    expect(admin.updateMovie.calls.mostRecent().args[0]).toBe(7);
    expect(fd.has('video_key')).toBeFalse();

    pick('#f-video', videoFile);
    await settle();
    c.save();
    fd = admin.updateMovie.calls.mostRecent().args[1];
    expect(fd.get('video_key')).toBe('movies/full/abc.mp4');
  });

  it('shows the backend validation error', async () => {
    admin.createMovie.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { video_key: ['Invalid key.'] } })));
    create();
    fillRequired();
    pick('#f-thumbnail', thumb);
    pick('#f-video', videoFile);
    await settle();
    c.save();
    fixture.detectChanges();
    expect(el().querySelector('.save-error')?.textContent).toContain('video_key: Invalid key.');
  });

  it('shows the translated session-expired message when the upload no longer belongs to the account', async () => {
    uploader.upload.and.rejectWith(new UploadError('session', 403, 'This upload does not belong to your account.'));
    create();
    pick('#f-video', videoFile);
    await settle();
    fixture.detectChanges();
    expect(c.video().error).toBe('uploadErrors.sessionExpired');
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects .webm / .exe / .docx without uploading, accepts MOVIE.MP4', async () => {
    create();
    for (const name of ['clip.webm', 'setup.exe', 'notes.docx']) {
      pick('#f-video', new File(['x'], name));
      expect(c.video().error).withContext(name).toBe('uploadErrors.videoType');
    }
    expect(uploader.upload).not.toHaveBeenCalled();
    pick('#f-video', new File(['x'], 'MOVIE.MP4'));
    await settle();
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });
});
