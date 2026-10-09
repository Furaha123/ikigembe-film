import { Directive, ElementRef, HostListener, OnDestroy, OnInit, inject, output } from '@angular/core';

/**
 * Open dialog layers, oldest first: Escape belongs to the last one. Backdrops register themselves;
 * dialogs with their own Escape handling (the payment modal) use these helpers to take part.
 */
const openLayers: object[] = [];

export function openEscapeLayer(layer: object): void {
  openLayers.push(layer);
}

export function closeEscapeLayer(layer: object): void {
  const i = openLayers.indexOf(layer);
  if (i !== -1) openLayers.splice(i, 1);
}

export function isTopEscapeLayer(layer: object): boolean {
  return openLayers[openLayers.length - 1] === layer;
}

/**
 * The dimmed layer behind a dialog, drawer or player. Emits `dismiss` when the backdrop itself is
 * clicked (not the dialog inside it) or when Escape is pressed anywhere on the page while this is
 * the topmost open backdrop. Dialogs inside need no click or key handlers of their own.
 *
 *   <div class="overlay" appModalBackdrop (dismiss)="close()">
 *     <div class="dialog" role="dialog" aria-modal="true">…</div>
 *   </div>
 *
 * Inner widgets that use Escape themselves (e.g. an open date picker) call `preventDefault()`.
 */
@Directive({ selector: '[appModalBackdrop]' })
export class ModalBackdropDirective implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly dismiss = output<void>();

  ngOnInit(): void {
    openEscapeLayer(this);
  }

  ngOnDestroy(): void {
    closeEscapeLayer(this);
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (event.target === this.host.nativeElement) this.dismiss.emit();
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (event.defaultPrevented || !isTopEscapeLayer(this)) return;
    event.preventDefault();
    this.dismiss.emit();
  }
}
