import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatePickerComponent, DateRange } from './date-picker';

describe('DatePickerComponent', () => {
  let fixture: ComponentFixture<DatePickerComponent>;
  let host: HTMLElement;

  const trigger = () => host.querySelector<HTMLButtonElement>('.dp-trigger')!;
  const label   = () => host.querySelector('.dp-label')!.textContent!.trim();
  const panel   = () => host.querySelector('.dp-panel');
  const dayButtons = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.dp-grid button:not([disabled])'));
  const dayButton = (n: number) => dayButtons().find(b => b.textContent!.trim() === String(n))!;

  const openPanel = () => {
    trigger().click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DatePickerComponent);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('renders a closed trigger with the range placeholder', () => {
    expect(label()).toBe('Select date range');
    expect(panel()).toBeNull();
  });

  it('opens the panel with one button per day of the current month', () => {
    openPanel();
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    expect(panel()).not.toBeNull();
    expect(dayButtons().length).toBe(daysInMonth);
  });

  it('emits an ordered range and closes after picking two days', () => {
    const emitted: DateRange[] = [];
    fixture.componentInstance.dateChange.subscribe(r => emitted.push(r));

    openPanel();
    dayButton(20).click();
    fixture.detectChanges();
    expect(emitted.length).toBe(0);

    dayButton(5).click(); // earlier than the start — should be swapped
    fixture.detectChanges();

    expect(emitted.length).toBe(1);
    expect(emitted[0].start!.getDate()).toBe(5);
    expect(emitted[0].end!.getDate()).toBe(20);
    expect(panel()).toBeNull();
    expect(label()).toContain('→');
  });

  it('emits a single date in singleMode', () => {
    fixture.componentRef.setInput('singleMode', true);
    fixture.detectChanges();
    const emitted: Date[] = [];
    fixture.componentInstance.singleDateChange.subscribe(d => emitted.push(d));

    expect(label()).toBe('Select date');
    openPanel();
    dayButton(12).click();
    fixture.detectChanges();

    expect(emitted.length).toBe(1);
    expect(emitted[0].getDate()).toBe(12);
    expect(panel()).toBeNull();
  });

  it('navigates to the next month', () => {
    openPanel();
    const title = () => host.querySelector('.dp-nav-title')!.textContent!.trim();
    const before = title();
    host.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.click();
    fixture.detectChanges();
    expect(title()).not.toBe(before);
  });

  it('closes when clicking outside the component', () => {
    openPanel();
    document.body.click();
    fixture.detectChanges();
    expect(panel()).toBeNull();
  });
});
