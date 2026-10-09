import { Component, EventEmitter, Input, OnDestroy, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { MyListComponent } from './my-list.component';
import { MovieService, MyListMovie } from '../../shared/services/movie.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PlaybackProgress, PlaybackSource } from '../../shared/models/movie-api.interface';
import { WatchProgressService } from '../../shared/services/watch-progress.service';
import { PaymentModalComponent } from '../../shared/components/payment-modal/payment-modal.component';
import { makeStreamResponse } from '../../shared/testing/stream-fixtures';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }

@Component({ selector: 'app-footer', template: '' })
class FooterStubComponent {}

@Component({ selector: 'app-video-player', template: '' })
class PlayerStubComponent implements OnDestroy {
  @Input() source: PlaybackSource | null = null;
  @Input() refreshSource: (() => Observable<PlaybackSource>) | null = null;
  @Input() poster = '';
  @Input() startAt = 0;
  @Input() showCloseButton = false;
  @Output() videoEnded = new EventEmitter<void>();
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

const ITEM: MyListMovie = {
  id: 12, title: 'Umurage', overview: '', thumbnail_url: 't.jpg', duration_minutes: 100,
  genres: [], rating: 7, price: 1500, progress_seconds: 120, duration_seconds: 6000,
  completed: false, last_watched_at: null,
};

describe('MyListComponent (playback)', () => {
  let fixture: ComponentFixture<MyListComponent>;
  let movieService: jasmine.SpyObj<MovieService>;
  let watchProgress: jasmine.SpyObj<WatchProgressService>;

  const card = () => fixture.nativeElement.querySelector('.movie-card') as HTMLButtonElement;
  const player = () => fixture.debugElement.query(d => d.componentInstance instanceof PlayerStubComponent)?.componentInstance as PlayerStubComponent | undefined;

  beforeEach(() => {
    movieService = jasmine.createSpyObj<MovieService>('MovieService', ['getMyList', 'getStream', 'getMovieDetails', 'saveProgress']);
    movieService.getMyList.and.returnValue(of([ITEM]));
    watchProgress = jasmine.createSpyObj<WatchProgressService>('WatchProgressService', ['report']);
    watchProgress.report.and.resolveTo();

    TestBed.configureTestingModule({
      imports: [MyListComponent],
      providers: [
        provideTranslateService(),
        { provide: MovieService, useValue: movieService },
        { provide: WatchProgressService, useValue: watchProgress },
      ],
    });
    TestBed.overrideComponent(MyListComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, VideoPlayerComponent, PaymentModalComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent, PlayerStubComponent, PaymentModalStubComponent] },
    });
    fixture = TestBed.createComponent(MyListComponent);
    fixture.detectChanges();
  });

  it('plays via /stream/ and resumes from saved progress', () => {
    const stream = makeStreamResponse();
    movieService.getStream.and.returnValue(of(stream));

    card().click();
    fixture.detectChanges();

    expect(movieService.getStream).toHaveBeenCalledOnceWith(12);
    expect(movieService.getMovieDetails).not.toHaveBeenCalled();
    expect(player()?.source?.src).toBe(stream.stream_url);
    expect(player()?.startAt).toBe(120);
  });

  it('shows the backend message when the stream is refused', () => {
    movieService.getStream.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { error: 'Purchase required to stream this movie.' },
    })));

    card().click();
    fixture.detectChanges();

    expect(player()).toBeUndefined();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Purchase required to stream this movie.');
  });

  it('view used: offers Buy again, then plays after payment', () => {
    movieService.getStream.and.returnValues(
      throwError(() => new HttpErrorResponse({
        status: 403, error: { error: 'Your view of this movie has been used. Purchase it again to watch.' },
      })),
      of(makeStreamResponse()),
    );

    card().click();
    fixture.detectChanges();
    const buyAgain = fixture.nativeElement.querySelector('.buy-again-btn') as HTMLButtonElement;
    expect(buyAgain).not.toBeNull();
    expect(movieService.getMyList).toHaveBeenCalledTimes(2); // list refreshed after the refusal

    buyAgain.click();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStubComponent).componentInstance as PaymentModalStubComponent;
    expect(modal.movie).toEqual(ITEM);

    modal.paid.emit();
    fixture.detectChanges();
    expect(movieService.getStream).toHaveBeenCalledTimes(2);
    expect(player()).toBeDefined();
  });

  it('another device: shows the message without a buy action', () => {
    movieService.getStream.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { error: 'This purchase is already being watched on another device.' },
    })));

    card().click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('another device');
    expect(fixture.nativeElement.querySelector('.buy-again-btn')).toBeNull();
  });

  it('reports progress and refreshes the list after the final close report', async () => {
    movieService.getStream.and.returnValue(of(makeStreamResponse()));
    card().click();
    fixture.detectChanges();
    const stub = player()!;

    stub.progressUpdate.emit({ position: 300, duration: 6000, reason: 'interval' });
    stub.closeReport = { position: 320, duration: 6000, reason: 'close' };
    stub.closed.emit();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(watchProgress.report).toHaveBeenCalledWith(12, { position: 300, duration: 6000, reason: 'interval' });
    expect(watchProgress.report).toHaveBeenCalledWith(12, { position: 320, duration: 6000, reason: 'close' });
    expect(movieService.getMyList).toHaveBeenCalledTimes(2);
  });

  it('shows the Watched badge from the boolean completed flag', () => {
    movieService.getMyList.and.returnValue(of([{ ...ITEM, completed: true }]));
    fixture = TestBed.createComponent(MyListComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.watched-badge')).not.toBeNull();
  });
});
