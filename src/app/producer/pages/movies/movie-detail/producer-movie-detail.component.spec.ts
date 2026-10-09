import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ProducerMovieDetailComponent } from './producer-movie-detail.component';
import { MovieAnalytics, ProducerMovieDetail, ProducerService, ProducerWallet } from '../../../services/producer.service';
import { MultipartUploadService, UploadError } from '../../../../shared/services/multipart-upload.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MultipartUploadApi } from '../../../../shared/models/upload.interface';

const MOVIE = {
  id: 7, title: 'Umurage', overview: '', thumbnail_url: null, backdrop_url: null, trailer_url: null,
  trailer_duration_seconds: null, video_url: null, hls_url: null, hls_status: 'ready', subtitles: null,
  price: 1500, views: 0, rating: 0, release_date: '2026-01-01', duration_minutes: 20, has_free_preview: false,
  is_active: false, cast: null, genres: null, producer: null, created_at: '', updated_at: '',
  approval_status: 'changes_requested', changes_requested_note: 'Fix the audio', rejection_reason: null,
} as ProducerMovieDetail;

const ANALYTICS: MovieAnalytics = {
  movie_id: 7, period: 'daily', views: 40, total_buyers: 3, gross_revenue: 3000, producer_earnings: 2400,
  trend: [
    { period_start: '2026-09-28T00:00:00Z', views: 10, watch_time_hours: 2.5, gross_revenue: 1000, net_earnings: 800, purchases: 1 },
    { period_start: '2026-09-29T00:00:00Z', views: 30, watch_time_hours: 7.25, gross_revenue: 2000, net_earnings: 1600, purchases: 2 },
  ],
  totals: { views: 40, watch_time_hours: 9.75, gross_revenue: 3000, net_earnings: 2400, purchases: 3 },
  watch_stats: { total_watchers: 4, completed_count: 3, completion_rate: 0.75, avg_progress_percent: 81 },
};

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
      ['getMovieDetail', 'movieUploadApi', 'resubmitFilmFiles', 'getDashboardMovies', 'getWallet', 'getMovieAnalytics']);
    producer.getMovieAnalytics.and.returnValue(of(ANALYTICS));
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
    uploader.upload.and.callFake((_f, _a, opts) => { signal = opts?.signal; return new Promise<string>(() => undefined); });

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

  describe('analytics come from the API, never from invented weights', () => {
    it('requests the selected range with a matching grouping and shows the API numbers', () => {
      component.setRange('7d');
      expect(producer.getMovieAnalytics).toHaveBeenCalledWith(7, '7d', 'daily');
      expect(component.rangeData().map(r => [r.views, r.revenue, r.purchases])).toEqual([[10, 800, 1], [30, 1600, 2]]);
      expect(component.rangeViews()).toBe(40);
      expect(component.estimatedRevenue()).toBe(component.fmt(2400)); // producer share, not gross
    });

    it('maps Lifetime to the API value and uses monthly buckets', () => {
      component.setRange('Lifetime');
      expect(producer.getMovieAnalytics).toHaveBeenCalledWith(7, 'lifetime', 'monthly');
    });

    it('takes completion from watch_stats and leaves per-period completion unknown', () => {
      component.setAdvBreakdown('Weekly');
      expect(producer.getMovieAnalytics).toHaveBeenCalledWith(7, '28d', 'weekly');
      expect(component.advTotals().completionRate).toBe(75);
      expect(component.advChartData().every(r => r.completionRate === null)).toBeTrue();
    });

    it('shows an error instead of numbers when the request fails', () => {
      producer.getMovieAnalytics.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      component.setRange('90d');
      expect(component.analyticsError()).toBeTrue();
      expect(component.rangeData()).toEqual([]);
    });
  });

  describe('security follow-ups', () => {
    it('shows the translated session-expired message when the upload no longer belongs to the account', async () => {
      uploader.upload.and.rejectWith(new UploadError('session', 403, 'This upload does not belong to your account.'));
      component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4', { type: 'video/mp4' })));
      await settle();
      expect(component.resubmitVideoError()).toBe('uploadErrors.sessionExpired');
      expect(uploader.upload).toHaveBeenCalledTimes(1);
    });

    it('rejects unsupported types before uploading (video and copyright)', () => {
      component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.webm')));
      component.onResubmitCopyrightSelected(fileEvent(new File(['x'], 'rights.docx')));
      expect(uploader.upload).not.toHaveBeenCalled();
      expect(component.resubmitVideoError()).toBe('uploadErrors.videoType');
      expect(component.resubmitCopyrightError()).toBe('uploadErrors.documentType');
    });

    it('shows the backend 400 reason on resubmit', async () => {
      uploader.upload.and.resolveTo('movies/full/7/new.mp4');
      producer.resubmitFilmFiles.and.returnValue(throwError(() => new HttpErrorResponse({
        status: 400, error: { error: 'video_key: Unsupported extension ".webm". Allowed: .avi, .mkv, .mov, .mp4' },
      })));
      component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4')));
      await settle();
      component.submitResubmit();
      expect(component.resubmitError()?.text).toContain('Unsupported extension');
      expect(component.resubmitVideoKey()).toBe('movies/full/7/new.mp4');
    });

    for (const [field, message] of [
      ['video', 'video_key was not uploaded by this account or has expired.'],
      ['copyright', 'copyright_document_key was not uploaded by this account or has expired.'],
    ] as const) {
      it(`stale ${field} key → "upload again" message and the stored key is cleared`, async () => {
        uploader.upload.and.resolveTo(field === 'video' ? 'movies/full/7/a.mp4' : 'movies/copyright/7/a.pdf');
        producer.resubmitFilmFiles.and.returnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { error: message } })));
        if (field === 'video') component.onResubmitVideoSelected(fileEvent(new File(['x'], 'film.mp4')));
        else component.onResubmitCopyrightSelected(fileEvent(new File(['x'], 'rights.pdf')));
        await settle();

        component.submitResubmit();

        expect(component.resubmitError()).toEqual({ text: null, key: 'uploadErrors.reuploadThenResubmit' });
        const key = field === 'video' ? component.resubmitVideoKey() : component.resubmitCopyrightKey();
        expect(key).toBeNull();
        expect(component.canResubmit()).toBeFalse();
      });
    }
  });
});

describe('ProducerMovieDetailComponent — rejected files never reach the API', () => {
  it('no upload request for .webm / .exe / .docx; MOVIE.MP4 starts one', () => {
    TestBed.configureTestingModule({
      imports: [ProducerMovieDetailComponent],
      providers: [
        provideRouter([]), provideTranslateService(), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
      ],
    });
    const f = TestBed.createComponent(ProducerMovieDetailComponent);
    const c = f.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const isUpload = (r: { url: string }) => r.url.includes('/movies/upload/');
    const ev = (name: string) => ({ target: { files: [new File(['x'], name)] } }) as unknown as Event;

    c.onResubmitVideoSelected(ev('clip.webm'));
    c.onResubmitVideoSelected(ev('setup.exe'));
    c.onResubmitCopyrightSelected(ev('rights.docx'));
    http.expectNone(isUpload);

    c.onResubmitVideoSelected(ev('MOVIE.MP4'));
    expect(http.expectOne(isUpload).request.body.field_name).toBe('video_file');
  });
});
