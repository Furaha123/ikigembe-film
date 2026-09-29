import { PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AdSlotComponent, AD_VISIBLE_MS } from './ad-slot.component';
import { AdsService } from '../../../core/services/ads.service';
import { DataSaverService } from '../../../core/services/data-saver.service';
import { Ad } from '../../models/cms.interface';

const AD: Ad = { id: 7, name: 'MTN MoMo', creative_url: 'https://cdn.test/momo.jpg', target_url: 'https://mtn.rw/momo', placement: 'home_banner' };

/** Minimal IntersectionObserver stand-in that lets tests drive visibility. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(public cb: IntersectionObserverCallback) { FakeObserver.instances.push(this); }
  observe(el: Element) { this.observed.push(el); }
  disconnect() { this.disconnected = true; }
  unobserve() { /* noop */ }
  takeRecords() { return []; }
  emit(ratio: number) {
    this.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe('AdSlotComponent', () => {
  let fixture: ComponentFixture<AdSlotComponent>;
  let ads: jasmine.SpyObj<AdsService>;
  let saver: { isActive: ReturnType<typeof signal<boolean>> };
  let realIO: typeof IntersectionObserver;

  const el = () => fixture.nativeElement as HTMLElement;
  const observer = () => FakeObserver.instances[FakeObserver.instances.length - 1];

  const setup = (platform: 'browser' | 'server' = 'browser') => {
    TestBed.configureTestingModule({
      imports: [AdSlotComponent],
      providers: [
        provideTranslateService(),
        { provide: AdsService, useValue: ads },
        { provide: DataSaverService, useValue: saver },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    fixture = TestBed.createComponent(AdSlotComponent);
    fixture.componentRef.setInput('placement', 'home_banner');
    fixture.detectChanges();
  };

  beforeEach(() => {
    ads = jasmine.createSpyObj<AdsService>('AdsService', ['list', 'trackImpression', 'trackClick']);
    ads.list.and.returnValue(of([AD]));
    saver = { isActive: signal(false) };
    FakeObserver.instances = [];
    realIO = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeObserver;
  });
  afterEach(() => {
    window.IntersectionObserver = realIO;
  });

  it('renders the first ad, labelled as sponsored, with a lazy image and meaningful alt', () => {
    setup();
    expect(ads.list).toHaveBeenCalledOnceWith('home_banner');
    expect(el().querySelector('.ad-label')?.textContent).toContain('ads.sponsored');
    const img = el().querySelector('img')!;
    expect(img.getAttribute('alt')).toBe('MTN MoMo');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('opens the target in a new tab with noopener noreferrer sponsored', () => {
    setup();
    const a = el().querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://mtn.rw/momo');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer sponsored');
  });

  it('tracks the click without preventing the link navigation', () => {
    setup();
    const a = el().querySelector('a')!;
    const evt = new MouseEvent('click', { cancelable: true });
    a.addEventListener('click', e => e.preventDefault(), { once: true }); // keep the test page in place
    a.dispatchEvent(evt);
    expect(ads.trackClick).toHaveBeenCalledOnceWith(7);
  });

  it('renders nothing when there is no live ad', () => {
    ads.list.and.returnValue(of([]));
    setup();
    expect(el().querySelector('aside')).toBeNull();
    expect(el().children.length).toBe(0);
  });

  it('never requests or tracks on the server', () => {
    setup('server');
    expect(ads.list).not.toHaveBeenCalled();
    expect(el().querySelector('aside')).toBeNull();
  });

  it('does not load ad images when data saver is on', () => {
    saver.isActive.set(true);
    setup();
    expect(ads.list).not.toHaveBeenCalled();
    expect(el().querySelector('img')).toBeNull();
  });

  it('counts one impression after >= 50 % visibility for >= 1 s — once per page view', fakeAsync(() => {
    setup();
    const io = observer();
    expect(io.observed.length).toBe(1);

    io.emit(0.6);
    tick(AD_VISIBLE_MS - 1);
    expect(ads.trackImpression).not.toHaveBeenCalled();
    tick(1);
    expect(ads.trackImpression).toHaveBeenCalledOnceWith(7);

    io.emit(0);
    io.emit(1);
    tick(AD_VISIBLE_MS * 3);
    fixture.detectChanges();
    expect(ads.trackImpression).toHaveBeenCalledTimes(1);
  }));

  it('does not count a glimpse shorter than 1 s or less than half visible', fakeAsync(() => {
    setup();
    const io = observer();
    io.emit(0.3);
    tick(AD_VISIBLE_MS * 2);
    io.emit(0.8);
    tick(AD_VISIBLE_MS / 2);
    io.emit(0);
    tick(AD_VISIBLE_MS * 2);
    expect(ads.trackImpression).not.toHaveBeenCalled();
  }));
});
