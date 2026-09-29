import {
  AfterViewChecked, Component, ElementRef, Input, NgZone, OnDestroy, OnInit, PLATFORM_ID, ViewChild, inject, signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdsService } from '../../../core/services/ads.service';
import { DataSaverService } from '../../../core/services/data-saver.service';
import { Ad, AdPlacement } from '../../models/cms.interface';

/** An impression counts once the creative is >= 50 % visible for >= 1 s. */
export const AD_VISIBLE_RATIO = 0.5;
export const AD_VISIBLE_MS = 1000;

/**
 * One sponsored slot. Renders nothing (no box, no layout shift) when there is
 * no live ad, the request fails, data saver is on, or during SSR. Tracking is
 * browser-only and never blocks navigation.
 */
@Component({
  selector: 'app-ad-slot',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './ad-slot.component.html',
  styleUrls: ['./ad-slot.component.scss'],
})
export class AdSlotComponent implements OnInit, AfterViewChecked, OnDestroy {
  @Input({ required: true }) placement!: AdPlacement;

  @ViewChild('creative') creativeRef?: ElementRef<HTMLElement>;

  private readonly ads = inject(AdsService);
  private readonly dataSaver = inject(DataSaverService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly zone = inject(NgZone);

  ad = signal<Ad | null>(null);

  private observer: IntersectionObserver | null = null;
  private observedEl: HTMLElement | null = null;
  private visibleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ads already counted during this page view. */
  private readonly counted = new Set<number>();

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId) || this.dataSaver.isActive()) return;
    this.ads.list(this.placement).subscribe(list => {
      const first = list.find(a => !!a.creative_url) ?? null;
      this.ad.set(first);
    });
  }

  ngAfterViewChecked(): void {
    const el = this.creativeRef?.nativeElement ?? null;
    if (el !== this.observedEl) this.observe(el);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /** Track the click, then let the link open target_url in a new tab. */
  onClick(ad: Ad): void {
    this.ads.trackClick(ad.id);
  }

  private observe(el: HTMLElement | null): void {
    this.disconnect();
    this.observedEl = el;
    const ad = this.ad();
    if (!el || !ad || this.counted.has(ad.id) || typeof IntersectionObserver === 'undefined') return;

    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        const visible = entries.some(e => e.isIntersecting && e.intersectionRatio >= AD_VISIBLE_RATIO);
        if (visible && !this.visibleTimer) {
          this.visibleTimer = setTimeout(() => this.countImpression(ad), AD_VISIBLE_MS);
        } else if (!visible) {
          this.clearTimer();
        }
      }, { threshold: [0, AD_VISIBLE_RATIO] });
      this.observer.observe(el);
    });
  }

  private countImpression(ad: Ad): void {
    this.visibleTimer = null;
    if (this.counted.has(ad.id)) return;
    this.counted.add(ad.id);
    this.ads.trackImpression(ad.id);
    this.observer?.disconnect();
    this.observer = null;
  }

  private clearTimer(): void {
    if (this.visibleTimer) { clearTimeout(this.visibleTimer); this.visibleTimer = null; }
  }

  private disconnect(): void {
    this.clearTimer();
    this.observer?.disconnect();
    this.observer = null;
  }
}
