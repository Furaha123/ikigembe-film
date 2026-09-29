import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { MovieDetailComponent } from './movie-detail.component';
import { MovieService } from '../../shared/services/movie.service';
import { PaymentService } from '../../core/services/payment.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { MovieDetailResponse, PlaybackSource } from '../../shared/models/movie-api.interface';
import { makeStreamResponse } from '../../shared/testing/stream-fixtures';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }

@Component({ selector: 'app-footer', template: '' })
class FooterStub {}

@Component({ selector: 'app-video-player', template: '' })
class PlayerStub {
  @Input() src = '';
  @Input() source: PlaybackSource | null = null;
  @Input() refreshSource: (() => Observable<PlaybackSource>) | null = null;
  @Input() poster = '';
  @Input() accentColor = '';
  @Input() autoplay = false;
  @Input() showCloseButton = false;
  @Output() closed = new EventEmitter<void>();
}

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() movie: unknown;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const SIGNED_DETAIL_URL = 'https://r2.test/leaked-detail.mp4?X-Amz-Signature=x';

function movieDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 12, title: 'Umurage', overview: 'A story', thumbnail_url: 't.jpg', backdrop_url: 'b.jpg',
    trailer_url: null, video_url: null, price: 1500, rating: 7.5, release_date: '2026-01-01',
    views: 10, duration_minutes: 100, has_free_preview: false, has_purchased: false,
    ...overrides,
  };
}

describe('MovieDetailComponent (viewer playback)', () => {
  let movieService: jasmine.SpyObj<MovieService>;
  let harness: RouterTestingHarness;

  async function open(details: ReturnType<typeof movieDetails>) {
    movieService.getMovieDetails.and.returnValue(of(details as unknown as MovieDetailResponse));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/movie/12', MovieDetailComponent);
    harness.detectChanges();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const watchButton = () => el().querySelector<HTMLButtonElement>('.btn-watch')!;
  const player = () => harness.fixture.debugElement.query(d => d.componentInstance instanceof PlayerStub)?.componentInstance as PlayerStub | undefined;

  beforeEach(() => {
    movieService = jasmine.createSpyObj<MovieService>('MovieService',
      ['getMovieDetails', 'getMovieCredits', 'getSimilarMovies', 'getMoviesByProducer', 'getStream']);
    movieService.getMovieCredits.and.returnValue(of({ cast: [] }));
    movieService.getSimilarMovies.and.returnValue(of({ results: [] }));

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'movie/:id', component: MovieDetailComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        { provide: MovieService, useValue: movieService },
        { provide: PaymentService, useValue: jasmine.createSpyObj('PaymentService', { hasPurchased: false }) },
      ],
    });
    TestBed.overrideComponent(MovieDetailComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent] },
      add: { imports: [HeaderStub, FooterStub, PlayerStub, PaymentModalStub] },
    });
  });

  it('shows the buy button for non-buyers even though video_url is null', async () => {
    await open(movieDetails({ video_url: null, has_purchased: false }));

    expect(watchButton()).not.toBeNull();
    expect(watchButton().textContent).toContain('viewer.detail.buyToWatch');

    watchButton().click();
    harness.detectChanges();

    expect(movieService.getStream).not.toHaveBeenCalled();
    expect(el().querySelector('app-payment-modal')).not.toBeNull();
  });

  it('plays stream_url from /stream/ — never the detail video_url', async () => {
    const stream = makeStreamResponse();
    movieService.getStream.and.returnValue(of(stream));
    await open(movieDetails({ has_purchased: true, video_url: SIGNED_DETAIL_URL }));

    watchButton().click();
    harness.detectChanges();

    expect(movieService.getStream).toHaveBeenCalledOnceWith(12);
    expect(player()?.source?.src).toBe(stream.stream_url);
    expect(player()?.source?.fallbackSrc).toBe(stream.fallback_url);
    expect(player()?.src).not.toBe(SIGNED_DETAIL_URL);
    expect(player()?.refreshSource).toEqual(jasmine.any(Function));
  });

  it('on 403 shows the backend message and offers the buy button again', async () => {
    movieService.getStream.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { error: 'Purchase required to stream this movie.' },
    })));
    await open(movieDetails({ has_purchased: true }));

    watchButton().click();
    harness.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Purchase required to stream this movie.');
    expect(watchButton().textContent).toContain('viewer.detail.buyToWatch');
    expect(player()).toBeUndefined();
  });

  it('shows a generic translated error when the stream fails without a message', async () => {
    movieService.getStream.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    await open(movieDetails({ has_purchased: true }));

    watchButton().click();
    harness.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('viewer.stream.failed');
  });

  it('requests the stream after a successful payment', async () => {
    movieService.getStream.and.returnValue(of(makeStreamResponse()));
    await open(movieDetails());

    watchButton().click();
    harness.detectChanges();
    const modal = harness.fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStub).componentInstance as PaymentModalStub;
    modal.paid.emit();
    harness.detectChanges();

    expect(movieService.getStream).toHaveBeenCalledOnceWith(12);
    expect(player()?.source).not.toBeNull();
  });

  it('drops the signed source when the player closes', async () => {
    movieService.getStream.and.returnValue(of(makeStreamResponse()));
    await open(movieDetails({ has_purchased: true }));
    watchButton().click();
    harness.detectChanges();

    player()!.closed.emit();
    harness.detectChanges();

    expect(player()).toBeUndefined();
    expect((harness.routeDebugElement!.componentInstance as MovieDetailComponent).playback()).toBeNull();
  });
});
