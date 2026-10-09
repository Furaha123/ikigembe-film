import { Component, EventEmitter, Input, OnDestroy, Output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { MovieDetailComponent } from './movie-detail.component';
import { MovieService } from '../../shared/services/movie.service';
import { PaymentService } from '../../core/services/payment.service';
import { AuthService } from '../../core/services/auth.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { MovieDetailResponse, PlaybackProgress, PlaybackSource } from '../../shared/models/movie-api.interface';
import { WatchProgressService } from '../../shared/services/watch-progress.service';
import { makeStreamResponse } from '../../shared/testing/stream-fixtures';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }

@Component({ selector: 'app-footer', template: '' })
class FooterStubComponent {}

@Component({ selector: 'app-video-player', template: '' })
class PlayerStubComponent implements OnDestroy {
  @Input() src = '';
  @Input() source: PlaybackSource | null = null;
  @Input() refreshSource: (() => Observable<PlaybackSource>) | null = null;
  @Input() poster = '';
  @Input() accentColor = '';
  @Input() autoplay = false;
  @Input() showCloseButton = false;
  @Output() closed = new EventEmitter<void>();
  @Output() progressUpdate = new EventEmitter<PlaybackProgress>();
  /** Like the real player: the final 'close' report is emitted from ngOnDestroy. */
  closeReport: PlaybackProgress | null = null;
  ngOnDestroy() { if (this.closeReport) this.progressUpdate.emit(this.closeReport); }
}

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStubComponent {
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
  let watchProgress: jasmine.SpyObj<WatchProgressService>;
  let payments: jasmine.SpyObj<PaymentService>;
  let harness: RouterTestingHarness;

  const asDetail = (d: ReturnType<typeof movieDetails>) => d as unknown as MovieDetailResponse;

  /** `after` is what the server returns on later detail reads (entitlement refresh). */
  async function open(details: ReturnType<typeof movieDetails>, after?: ReturnType<typeof movieDetails>) {
    const later = asDetail(after ?? details);
    movieService.getMovieDetails.and.returnValues(of(asDetail(details)), of(later), of(later));
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/movie/12', MovieDetailComponent);
    harness.detectChanges();
  }

  const el = () => harness.routeNativeElement as HTMLElement;
  const watchButton = () => el().querySelector<HTMLButtonElement>('.btn-watch')!;
  const player = () => harness.fixture.debugElement.query(d => d.componentInstance instanceof PlayerStubComponent)?.componentInstance as PlayerStubComponent | undefined;

  /** Signed in by default; the visitor spec signs out. */
  const loggedIn = signal(true);

  beforeEach(() => {
    loggedIn.set(true);
    movieService = jasmine.createSpyObj<MovieService>('MovieService',
      ['getMovieDetails', 'getRelatedMovies', 'getMoviesByProducer', 'getStream']);
    movieService.getRelatedMovies.and.returnValue(of({ results: [] }));
    watchProgress = jasmine.createSpyObj<WatchProgressService>('WatchProgressService', ['report']);
    watchProgress.report.and.resolveTo();
    payments = jasmine.createSpyObj<PaymentService>('PaymentService', ['hasPurchased', 'forgetPurchase', 'pendingDeposit']);
    payments.hasPurchased.and.returnValue(false);
    payments.pendingDeposit.and.returnValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'movie/:id', component: MovieDetailComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService(),
        { provide: MovieService, useValue: movieService },
        { provide: PaymentService, useFactory: () => payments },
        { provide: WatchProgressService, useFactory: () => watchProgress },
        { provide: AuthService, useValue: { isLoggedIn: loggedIn } },
      ],
    });
    TestBed.overrideComponent(MovieDetailComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent, PlayerStubComponent, PaymentModalStubComponent] },
    });
  });

  describe('visitors', () => {
    it('sends a signed-out visitor to sign in instead of the payment', async () => {
      loggedIn.set(false);
      await open(movieDetails({ release_state: 'released' }));
      const router = TestBed.inject(Router);
      const nav = spyOn(router, 'navigate').and.resolveTo(true);
      (el().querySelector('button.btn-watch') as HTMLButtonElement).click();
      expect(nav).toHaveBeenCalledWith(['/login'], jasmine.objectContaining({ queryParams: jasmine.any(Object) }));
      expect(movieService.getStream).not.toHaveBeenCalled();
    });
  });

  describe('coming soon', () => {
    it('shows the release moment instead of a buy button and never requests the stream', async () => {
      await open(movieDetails({ release_state: 'coming_soon', release_at: '2031-03-01T16:00:00Z', trailer_url: 't.mp4' }));
      expect(el().querySelector('button.btn-watch')).toBeNull();
      expect(el().querySelector('.btn-watch--soon')!.textContent).toContain('viewer.detail.availableOn');
      expect(el().querySelector('.btn-trailer')).not.toBeNull();
      expect(movieService.getStream).not.toHaveBeenCalled();
    });

    it('a released film keeps the buy action', async () => {
      await open(movieDetails({ release_state: 'released' }));
      expect(el().querySelector('button.btn-watch')).not.toBeNull();
      expect(el().querySelector('.btn-watch--soon')).toBeNull();
    });
  });

  describe('load states', () => {
    const openFailing = async (status: number) => {
      movieService.getMovieDetails.and.returnValue(throwError(() => new HttpErrorResponse({ status })));
      harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/movie/12', MovieDetailComponent);
      harness.detectChanges();
    };

    it('404 → "film not available" with a way back, no retry', async () => {
      await openFailing(404);
      expect(el().querySelector('h1')!.textContent).toContain('movieDetailPage.notFoundTitle');
      expect(el().querySelector('a[href="/browse"]')).not.toBeNull();
      expect(el().querySelector('.detail-error button')).toBeNull();
    });

    it('a server/network error offers a retry that reloads the film', async () => {
      await openFailing(0);
      expect(el().querySelector('h1')!.textContent).toContain('movieDetailPage.loadErrorTitle');
      movieService.getMovieDetails.and.returnValue(of(asDetail(movieDetails())));
      el().querySelector<HTMLButtonElement>('.detail-error button')!.click();
      harness.detectChanges();
      expect(el().querySelector('h1')!.textContent).toContain('Umurage');
    });

    it('failing credits or similar films do not take the page down', async () => {
      movieService.getRelatedMovies.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      await open(movieDetails());
      expect(el().querySelector('h1')!.textContent).toContain('Umurage');
      expect(el().querySelector('.similar-title')).toBeNull(); // no empty "You may also like" heading
    });

    it('offers to check a payment that was started earlier and not confirmed', async () => {
      payments.pendingDeposit.and.returnValue('dep-1');
      await open(movieDetails());
      expect(el().querySelector('.stream-pending')).not.toBeNull();
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
    await open(movieDetails({ has_purchased: true }), movieDetails({ has_purchased: false }));

    watchButton().click();
    harness.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Purchase required to stream this movie.');
    expect(payments.forgetPurchase).toHaveBeenCalledWith(12);
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
    const modal = harness.fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStubComponent).componentInstance as PaymentModalStubComponent;
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

  describe('single-device policy', () => {
    const refuse = (message: string) => movieService.getStream.and.returnValue(throwError(() =>
      new HttpErrorResponse({ status: 403, error: { error: message } })));

    it('view used: shows the message and turns the button into Buy again, which opens the payment modal', async () => {
      refuse('Your view of this movie has been used. Purchase it again to watch.');
      await open(movieDetails({ has_purchased: true }), movieDetails({ has_purchased: false }));

      watchButton().click();
      harness.detectChanges();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('Your view of this movie has been used');
      expect(watchButton().textContent).toContain('viewer.stream.buyAgain');

      watchButton().click();
      harness.detectChanges();
      expect(el().querySelector('app-payment-modal')).not.toBeNull();
    });

    it('another device: shows the message and offers no purchase', async () => {
      refuse('This purchase is already being watched on another device.');
      await open(movieDetails({ has_purchased: true }));

      watchButton().click();
      harness.detectChanges();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('already being watched on another device');
      expect(watchButton().textContent).toContain('viewer.detail.watchMovie');
      expect(payments.forgetPurchase).not.toHaveBeenCalled();
    });

    it('re-reads has_purchased after a refused stream (it can flip to false)', async () => {
      refuse('Your view of this movie has been used. Purchase it again to watch.');
      await open(movieDetails({ has_purchased: true }), movieDetails({ has_purchased: false }));

      watchButton().click();
      harness.detectChanges();

      expect(movieService.getMovieDetails).toHaveBeenCalledTimes(2);
    });

    it('re-reads has_purchased after the full movie player closes', async () => {
      movieService.getStream.and.returnValue(of(makeStreamResponse()));
      await open(movieDetails({ has_purchased: true }), movieDetails({ has_purchased: false }));
      watchButton().click();
      harness.detectChanges();

      player()!.closed.emit();
      harness.detectChanges();

      expect(movieService.getMovieDetails).toHaveBeenCalledTimes(2);
      expect(watchButton().textContent).toContain('viewer.detail.buyToWatch');
    });

    it('trusts the server has_purchased over the local purchase hint', async () => {
      payments.hasPurchased.and.returnValue(true);
      await open(movieDetails({ has_purchased: false }));
      expect(watchButton().textContent).toContain('viewer.detail.buyToWatch');
    });
  });

  describe('watch progress', () => {
    it('reports full-movie progress, including the final report after close', async () => {
      movieService.getStream.and.returnValue(of(makeStreamResponse()));
      await open(movieDetails({ has_purchased: true }));
      watchButton().click();
      harness.detectChanges();

      const p: PlaybackProgress = { position: 100, duration: 6000, reason: 'interval' };
      const stub = player()!;
      stub.progressUpdate.emit(p);
      stub.closeReport = { ...p, reason: 'close' };
      stub.closed.emit();
      harness.detectChanges();

      expect(watchProgress.report).toHaveBeenCalledWith(12, p);
      expect(watchProgress.report).toHaveBeenCalledWith(12, { ...p, reason: 'close' });
    });

    it('does not report trailer playback', async () => {
      await open(movieDetails({ trailer_url: 'https://cdn.test/trailer.mp4' }));
      el().querySelector<HTMLButtonElement>('.btn-trailer')!.click();
      harness.detectChanges();

      player()!.progressUpdate.emit({ position: 30, duration: 90, reason: 'pause' });

      expect(watchProgress.report).not.toHaveBeenCalled();
    });
  });
});
