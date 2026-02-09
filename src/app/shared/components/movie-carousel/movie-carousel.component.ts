import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  Injector,
  input,
  signal,
  ViewEncapsulation,
  viewChild,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { IVideoContent } from '../../models/video-content.interface';
import { ImagePipe } from '../../pipes/image.pipe';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-movie-carousel',
  templateUrl: './movie-carousel.component.html',
  styleUrls: ['./movie-carousel.component.scss'],
  imports: [ ImagePipe],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('fade', [
      transition('void => *', [
        style({ opacity: 0 }),
        animate(300, style({ opacity: 1 })),
      ]),
    ]),
  ],
})
export class MovieCarouselComponent {
  private router = inject(Router);

  videoContents = input<IVideoContent[]>([]);
  title = input<string>('');
  swiperContainer = viewChild.required<ElementRef>('swiperContainer');
  selectedContent = signal<string | null>(null);
  private swiperInstance: Swiper | null = null;
  private injector = inject(Injector);

  constructor() {
    effect(() => {
      const contents = this.videoContents();
      if (contents && contents.length > 0) {
        afterNextRender(() => {
          if (this.swiperInstance) {
            this.swiperInstance.destroy(true, true);
          }
          this.swiperInstance = this.initSwiper();
        }, { injector: this.injector });
      }
    });
  }

  private initSwiper() {
    return new Swiper(this.swiperContainer().nativeElement, {
      modules: [Navigation],
      slidesPerView: 2,
      slidesPerGroup: 2,
      spaceBetween: 8,
      centeredSlides: false,
      loop: true,
      navigation: {
        nextEl: this.swiperContainer().nativeElement.querySelector('.swiper-button-next'),
        prevEl: this.swiperContainer().nativeElement.querySelector('.swiper-button-prev'),
      },
      breakpoints: {
        600: {
          slidesPerView: 2,
          slidesPerGroup: 2,
          spaceBetween: 5,
          centeredSlides: true,
        },
        900: {
          slidesPerView: 3,
          slidesPerGroup: 3,
          spaceBetween: 5,
          centeredSlides: true,
        },
        1200: {
          slidesPerView: 4,
          slidesPerGroup: 4,
          spaceBetween: 5,
          centeredSlides: false,
        },
        1500: {
          slidesPerView: 5,
          slidesPerGroup: 5,
          spaceBetween: 5,
          centeredSlides: false,
        },
        1800: {
          slidesPerView: 5,
          slidesPerGroup: 6,
          spaceBetween: 5,
          centeredSlides: false,
        },
      },
    });
  }

  setHoverMovie(movie: IVideoContent) {
    this.selectedContent.set(movie.title ?? movie.name);
  }

  clearHoverMovie() {
    this.selectedContent.set(null);
  }

  goToMovie(movie: IVideoContent) {
    this.router.navigate(['/movie', movie.id]);
  }
}
