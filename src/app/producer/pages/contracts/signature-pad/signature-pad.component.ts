import {
  AfterViewInit, Component, ElementRef, HostListener, OnDestroy, PLATFORM_ID, ViewChild,
  inject, output, signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

// Minimum drawing before a signature counts (CSS px). The API runs its own,
// stricter checks on the image; these only keep the button honest.
const MIN_STROKE_LENGTH = 120;
const MIN_SPAN_RATIO = 0.15;

/**
 * Draw-to-sign pad: dark strokes on a transparent canvas, exported as PNG.
 * Pointer events cover mouse, touch and pen.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="pad" [class.has-ink]="hasInk()">
      <canvas #canvas
              (pointerdown)="start($event)" (pointermove)="move($event)"
              (pointerup)="end()" (pointercancel)="end()" (pointerleave)="end()"
              role="img" [attr.aria-label]="'contracts.acceptance.padLabel' | translate"></canvas>
      @if (empty()) {
        <span class="pad-hint">{{ 'contracts.acceptance.padHint' | translate }}</span>
      }
      <span class="pad-line" aria-hidden="true"></span>
    </div>
    <button type="button" class="pad-clear" (click)="clear()" [disabled]="empty()">
      {{ 'contracts.acceptance.clear' | translate }}
    </button>
  `,
  styles: [`
    :host { display: block; }
    .pad {
      position: relative;
      height: 180px;
      border-radius: 10px;
      background: #fff;
      border: 2px dashed rgba(201, 168, 76, 0.55);
      overflow: hidden;
      &.has-ink { border-style: solid; }
    }
    canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; }
    .pad-hint {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      color: #9a9a9a; font-size: 14px; pointer-events: none;
    }
    .pad-line {
      position: absolute; left: 8%; right: 8%; bottom: 38px;
      border-bottom: 1px solid #d6d6d6; pointer-events: none;
    }
    .pad-clear {
      margin-top: 8px; background: none; border: none; padding: 4px 0;
      color: #c9a84c; font-size: 13px; cursor: pointer;
      &:disabled { color: #666; cursor: default; }
    }
  `],
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  /** True once enough has been drawn to count as a signature. */
  readonly inkChange = output<boolean>();

  readonly empty  = signal(true);
  readonly hasInk = signal(false);

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private last: { x: number; y: number } | null = null;
  private strokeLength = 0;
  private minX = Infinity;
  private maxX = -Infinity;
  private cssWidth = 0;

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.resize();
  }

  ngOnDestroy() {
    this.ctx = null;
  }

  // Resizing a canvas wipes it, so only follow width changes while it's still empty.
  @HostListener('window:resize')
  onResize() {
    if (this.empty()) this.resize();
  }

  start(e: PointerEvent) {
    if (!this.ctx) return;
    e.preventDefault();
    this.canvasRef.nativeElement.setPointerCapture?.(e.pointerId);
    this.drawing = true;
    this.last = this.point(e);
    this.dot(this.last);
  }

  move(e: PointerEvent) {
    if (!this.drawing || !this.ctx || !this.last) return;
    e.preventDefault();
    const p = this.point(e);
    this.ctx.beginPath();
    this.ctx.moveTo(this.last.x, this.last.y);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.strokeLength += Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.track(p);
    this.last = p;
  }

  end() {
    this.drawing = false;
    this.last = null;
  }

  clear() {
    if (!this.ctx) return;
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.strokeLength = 0;
    this.minX = Infinity;
    this.maxX = -Infinity;
    this.empty.set(true);
    this.setInk(false);
  }

  /** The signature as a PNG (transparent background). */
  toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) =>
      this.canvasRef.nativeElement.toBlob(b => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'),
    );
  }

  private resize() {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || rect.width === this.cssWidth) return;
    const dpr = window.devicePixelRatio || 1;
    this.cssWidth = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.scale(dpr, dpr);
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#111';
    this.ctx.fillStyle = '#111';
  }

  private point(e: PointerEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private dot(p: { x: number; y: number }) {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, 1.25, 0, Math.PI * 2);
    this.ctx.fill();
    this.track(p);
  }

  private track(p: { x: number; y: number }) {
    this.minX = Math.min(this.minX, p.x);
    this.maxX = Math.max(this.maxX, p.x);
    this.empty.set(false);
    this.setInk(
      this.strokeLength >= MIN_STROKE_LENGTH && this.maxX - this.minX >= MIN_SPAN_RATIO * this.cssWidth,
    );
  }

  private setInk(value: boolean) {
    if (value === this.hasInk()) return;
    this.hasInk.set(value);
    this.inkChange.emit(value);
  }
}
