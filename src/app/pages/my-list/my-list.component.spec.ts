import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { MyListComponent } from './my-list.component';
import { MovieService, MyListMovie } from '../../shared/services/movie.service';
import { HeaderComponent } from '../../core/components/header/header.component';
import { FooterComponent } from '../../core/components/footer/footer.component';
import { VideoPlayerComponent } from '../../shared/components/video-player/video-player.component';
import { PlaybackSource } from '../../shared/models/movie-api.interface';
import { makeStreamResponse } from '../../shared/testing/stream-fixtures';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }

@Component({ selector: 'app-footer', template: '' })
class FooterStub {}

@Component({ selector: 'app-video-player', template: '' })
class PlayerStub {
  @Input() source: PlaybackSource | null = null;
  @Input() refreshSource: (() => Observable<PlaybackSource>) | null = null;
  @Input() poster = '';
  @Input() startAt = 0;
  @Input() showCloseButton = false;
  @Output() progressUpdate = new EventEmitter<number>();
  @Output() videoEnded = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

const ITEM: MyListMovie = {
  id: 12, title: 'Umurage', overview: '', thumbnail_url: 't.jpg', duration_minutes: 100,
  genres: [], rating: 7, price: 1500, progress_seconds: '120', duration_seconds: '6000',
  completed: 'false', last_watched_at: '',
};

describe('MyListComponent (playback)', () => {
  let fixture: ComponentFixture<MyListComponent>;
  let movieService: jasmine.SpyObj<MovieService>;

  const card = () => fixture.nativeElement.querySelector('.movie-card') as HTMLButtonElement;
  const player = () => fixture.debugElement.query(d => d.componentInstance instanceof PlayerStub)?.componentInstance as PlayerStub | undefined;

  beforeEach(() => {
    movieService = jasmine.createSpyObj<MovieService>('MovieService', ['getMyList', 'getStream', 'getMovieDetails', 'saveProgress']);
    movieService.getMyList.and.returnValue(of([ITEM]));

    TestBed.configureTestingModule({
      imports: [MyListComponent],
      providers: [provideTranslateService(), { provide: MovieService, useValue: movieService }],
    });
    TestBed.overrideComponent(MyListComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, VideoPlayerComponent] },
      add: { imports: [HeaderStub, FooterStub, PlayerStub] },
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
});
