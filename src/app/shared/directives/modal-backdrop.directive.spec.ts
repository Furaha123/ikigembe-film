import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalBackdropDirective } from './modal-backdrop.directive';

@Component({
  imports: [ModalBackdropDirective],
  template: `
    @if (outer()) {
      <div class="outer" appModalBackdrop (dismiss)="outer.set(false)">
        <div class="outer-dialog" role="dialog" aria-modal="true">
          <button type="button" class="inside">Inside</button>
          <input class="field" />
        </div>
      </div>
    }
    @if (inner()) {
      <div class="inner" appModalBackdrop (dismiss)="inner.set(false)">
        <div role="dialog" aria-modal="true">Second</div>
      </div>
    }
  `,
})
class HostComponent {
  readonly outer = signal(true);
  readonly inner = signal(false);
}

describe('ModalBackdropDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
  const escapeFrom = (el: Element) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('closes when the backdrop itself is clicked, not when the dialog is', () => {
    q('.inside')!.click();
    q('.outer-dialog')!.click();
    expect(host.outer()).toBeTrue();
    q('.outer')!.click();
    expect(host.outer()).toBeFalse();
  });

  it('closes on Escape pressed inside the dialog', () => {
    escapeFrom(q('.field')!);
    expect(host.outer()).toBeFalse();
  });

  it('closes on Escape pressed anywhere on the page', () => {
    escapeFrom(document.body);
    expect(host.outer()).toBeFalse();
  });

  it('closes only the topmost backdrop per Escape', () => {
    host.inner.set(true);
    fixture.detectChanges();
    escapeFrom(document.body);
    fixture.detectChanges();
    expect([host.outer(), host.inner()]).toEqual([true, false]);
    escapeFrom(document.body);
    expect(host.outer()).toBeFalse();
  });

  it('leaves Escape alone when an inner widget already handled it', () => {
    const field = q('.field')!;
    field.addEventListener('keydown', e => e.preventDefault(), { once: true });
    escapeFrom(field);
    expect(host.outer()).toBeTrue();
  });

  it('ignores other keys', () => {
    q('.field')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.outer()).toBeTrue();
  });
});
