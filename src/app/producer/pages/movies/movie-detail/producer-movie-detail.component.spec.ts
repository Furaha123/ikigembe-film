import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ProducerMovieDetailComponent } from './producer-movie-detail.component';
import { ProducerMovieDetail, ProducerService, ProducerWallet } from '../../../services/producer.service';
import { MultipartUploadService } from '../../../../shared/services/multipart-upload.service';
import { MultipartUploadApi } from '../../../../shared/models/upload.interface';

const MOVIE = {
  id: 7, title: 'Umurage', overview: '', thumbnail_url: null, backdrop_url: null, trailer_url: null,
  trailer_duration_seconds: null, video_url: null, hls_url: null, hls_status: 'ready', subtitles: null,
  price: 1500, views: 0, rating: 0, release_date: '2026-01-01', duration_minutes: 20, has_free_preview: false,
  is_active: false, cast: null, genres: null, producer: null, created_at: '', updated_at: '',
  approval_status: 'changes_requested', changes_requested_note: 'Fix the audio', rejection_reason: null,
} as ProducerMovieDetail;

const WALLET: ProducerWallet = {
  gross_revenue: 0, platform_commission: 0, total_earnings: 0, wallet_balance: 0,
  pending_withdrawals: 0, total_withdrawn: 0, producer_share_percentage: 65,
};

describe('ProducerMovieDetailComponent (resubmit)', () => {
  let fixture: ComponentFixture<ProducerMovieDetailComponent>;
  let component: ProducerMovieDetailComponent;
  let producer: jasmine.SpyObj<ProducerService>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  const fakeApi = {} as MultipartUploadApi;

  const fileEvent = (file: File) => ({ target: { files: [file] } }) as unknown as Event;
  const settle = () => new Promise(r => setTimeout(r));

  beforeEach(() => {
    producer = jasmine.createSpyObj<ProducerService>('ProducerService',
      ['getMovieDetail', 'movieUploadApi', 'resubmitFilmFiles', 'getDashboardMovies', 'getWallet']);
    producer.getMovieDetail.and.returnValue(of(MOVIE));
    producer.getDashboardMovies.and.returnValue(of([]));
    producer.getWallet.and.returnValue(of(WALLET));
    producer.movieUploadApi.and.returnValue(fakeApi);
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);

    TestBed.configureTestingModule({
      imports: [ProducerMovieDetailComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: ProducerService, useValue: producer },
        { provide: MultipartUploadService, useValue: uploader },
      ],
    });
    fixture = TestBed.createComponent(ProducerMovieDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('uploads a replacement copyright document via multipart with field_name=copyright_document', async () => {
    uploader.upload.and.resolveTo('movies/copyright/new.pdf');
    const file = new File(['%PDF'], 'rights.pdf', { type: 'application/pdf' });

    component.onResubmitCopyrightSelected(fileEvent(file));
    await settle();

    expect(producer.movieUploadApi).toHaveBeenCalledOnceWith('copyright_document');
    expect(uploader.upload).toHaveBeenCalledOnceWith(file, fakeApi, jasmine.objectContaining({ signal: jasmine.any(AbortSignal) }));
    expect(component.resubmitCopyrightKey()).toBe('movies/copyright/new.pdf');
    expect(component.resubmitCopyrightUploading()).toBeFalse();
  });

  it('uploads a replacement video with field_name=video_file and resubmits the key', async () => {
    uploader.upload.and.resolveTo('movies/full/new.mp4');
    producer.resubmitFilmFiles.and.returnValue(of({ ...MOVIE, approval_status: 'pending_review' }));

    component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4', { type: 'video/mp4' })));
    await settle();
    component.submitResubmit();

    expect(producer.movieUploadApi).toHaveBeenCalledOnceWith('video_file');
    expect(producer.resubmitFilmFiles).toHaveBeenCalledOnceWith(7, { video_key: 'movies/full/new.mp4' });
    expect(component.resubmitSuccess()).toBeTrue();
    expect(component.movie()?.approval_status).toBe('pending_review');
  });

  it('shows a translated error when the upload fails', async () => {
    uploader.upload.and.rejectWith(new Error('Part 1 failed (500)'));

    component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4', { type: 'video/mp4' })));
    await settle();

    expect(component.resubmitVideoError()).toBe('movieDetail.resubmit.uploadFailed');
    expect(component.resubmitVideoKey()).toBeNull();
    expect(component.resubmitVideoUploading()).toBeFalse();
  });

  it('shows the backend message when the resubmit is rejected', async () => {
    uploader.upload.and.resolveTo('movies/copyright/new.pdf');
    producer.resubmitFilmFiles.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 409, error: { error: 'Resubmit is only available when changes have been requested by the admin.' },
    })));

    component.onResubmitCopyrightSelected(fileEvent(new File(['%PDF'], 'rights.pdf', { type: 'application/pdf' })));
    await settle();
    component.submitResubmit();

    expect(component.resubmitError()).toEqual({
      text: 'Resubmit is only available when changes have been requested by the admin.',
      key: 'movieDetail.resubmit.failed',
    });
    expect(component.resubmitSuccess()).toBeFalse();
  });

  it('cancels an in-flight upload when the dialog is closed', () => {
    let signal: AbortSignal | undefined;
    uploader.upload.and.callFake((_f, _a, opts) => { signal = opts?.signal; return new Promise<string>(() => {}); });

    component.resubmitOpen.set(true);
    component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4', { type: 'video/mp4' })));
    component.closeResubmit();

    expect(signal?.aborted).toBeTrue();
    expect(component.resubmitVideoUploading()).toBeFalse();
    expect(component.resubmitOpen()).toBeFalse();
  });

  it('fetches a fresh preview URL each time the player is opened', () => {
    producer.getMovieDetail.and.returnValue(of({ ...MOVIE, hls_url: 'https://api.test/master.m3u8?token=fresh' }));

    component.watchMovie();

    expect(producer.getMovieDetail).toHaveBeenCalledTimes(2); // page load + preview
    expect(component.watchSrc()).toBe('https://api.test/master.m3u8?token=fresh');
    expect(component.isWatching()).toBeTrue();
  });

  describe('revenue estimates use the film\'s split, never a hardcoded 70 %', () => {
    const recreate = () => {
      producer.getWallet.calls.reset();
      fixture = TestBed.createComponent(ProducerMovieDetailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      component.movie.set({ ...MOVIE, views: 100_000, price: 1000 });
    };
    const revenues = () => component.rangeData().map(d => ({ views: d.views, revenue: d.revenue }));

    it('uses earned / gross for this film from the dashboard movies endpoint', () => {
      producer.getDashboardMovies.and.returnValue(of([
        { id: 7, title: 'Umurage', views: 0, purchases: 10, total_gross_revenue: 10_000, producer_share: 8_000, monthly_views: [] },
      ]));
      recreate();
      expect(component.shareRatio()).toBe(0.8);
      for (const r of revenues()) {
        expect(r.revenue).toBe(Math.round(r.views * 1000 * 0.8));
        if (r.views > 0) expect(r.revenue).not.toBe(Math.round(r.views * 1000 * 0.7));
      }
      expect(producer.getWallet).not.toHaveBeenCalled();
    });

    it('falls back to the wallet\'s blended percentage when the film has no sales yet', () => {
      recreate();
      expect(component.shareRatio()).toBe(0.65);
      for (const r of revenues()) expect(r.revenue).toBe(Math.round(r.views * 1000 * 0.65));
    });

    it('shows no revenue estimate when the split is unknown', () => {
      producer.getWallet.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      recreate();
      expect(component.shareRatio()).toBeNull();
      expect(revenues().every(r => r.revenue === 0)).toBeTrue();
    });
  });
});
