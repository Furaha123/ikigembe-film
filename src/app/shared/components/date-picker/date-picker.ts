import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  input,
  output,
  signal
} from "@angular/core";
import { DatePipe } from "@angular/common";

export interface DateRange {
  start: Date | null;
  end:   Date | null;
}

@Component({
  selector: "procurement-date-picker",
  templateUrl: "./date-picker.html",
  styleUrl: "./date-picker.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe]
})
export class DatePickerComponent {
  public disabled   = input(false);
  public dateChange = output<DateRange>();

  protected open        = signal(false);
  protected viewYear    = signal(new Date().getFullYear());
  protected viewMonth   = signal(new Date().getMonth());   // 0-based
  protected startDate   = signal<Date | null>(null);
  protected endDate     = signal<Date | null>(null);
  protected hovered     = signal<Date | null>(null);

  protected readonly DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  protected readonly MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];

  // ── Calendar grid ──────────────────────────────────────
  protected weeks = computed(() => {
    const year  = this.viewYear();
    const month = this.viewMonth();
    const first = new Date(year, month, 1);
    // Monday-based offset (0=Mon … 6=Sun)
    let dow = first.getDay(); // 0=Sun
    const offset = dow === 0 ? 6 : dow - 1;

    const days: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) days.push(null);

    const total = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= total; d++) days.push(new Date(year, month, d));

    while (days.length % 7 !== 0) days.push(null);

    const result: (Date | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  });

  protected label = computed(() => {
    const s = this.startDate(), e = this.endDate();
    if (s && e) return `${this.fmt(s)}  →  ${this.fmt(e)}`;
    if (s)      return `${this.fmt(s)}  →  …`;
    return 'Select date range';
  });

  // ── Navigation ─────────────────────────────────────────
  protected prevMonth() {
    let m = this.viewMonth() - 1, y = this.viewYear();
    if (m < 0) { m = 11; y--; }
    this.viewMonth.set(m); this.viewYear.set(y);
  }

  protected nextMonth() {
    let m = this.viewMonth() + 1, y = this.viewYear();
    if (m > 11) { m = 0; y++; }
    this.viewMonth.set(m); this.viewYear.set(y);
  }

  // ── Day selection ──────────────────────────────────────
  protected selectDay(day: Date | null) {
    if (!day) return;
    const s = this.startDate(), e = this.endDate();

    if (!s || (s && e)) {
      // fresh pick
      this.startDate.set(day);
      this.endDate.set(null);
      return;
    }

    // second pick — ensure start <= end
    if (day < s) {
      this.endDate.set(s);
      this.startDate.set(day);
    } else {
      this.endDate.set(day);
    }
    this.hovered.set(null);
    this.open.set(false);
    this.dateChange.emit({ start: this.startDate(), end: this.endDate() });
  }

  // ── Day state helpers ──────────────────────────────────
  protected isStart(d: Date | null)  { return d && this.sameDay(d, this.startDate()); }
  protected isEnd(d: Date | null)    { return d && this.sameDay(d, this.endDate()); }
  protected isToday(d: Date | null)  { return d && this.sameDay(d, new Date()); }

  protected inRange(d: Date | null): boolean {
    if (!d) return false;
    const s = this.startDate(), e = this.endDate() ?? this.hovered();
    if (!s || !e) return false;
    const lo = new Date(Math.min(s.getTime(), e.getTime()));
    const hi = new Date(Math.max(s.getTime(), e.getTime()));
    return d > lo && d < hi;
  }

  protected dayClass(d: Date | null): string {
    if (!d) return 'dp-day dp-day--empty';
    const cls: string[] = ['dp-day'];
    if (this.isToday(d))  cls.push('dp-day--today');
    if (this.isStart(d))  cls.push('dp-day--start');
    if (this.isEnd(d))    cls.push('dp-day--end');
    if (this.inRange(d))  cls.push('dp-day--range');
    return cls.join(' ');
  }

  // ── Misc ───────────────────────────────────────────────
  private sameDay(a: Date, b: Date | null): boolean {
    return !!b &&
      a.getDate()     === b.getDate() &&
      a.getMonth()    === b.getMonth() &&
      a.getFullYear() === b.getFullYear();
  }

  private fmt(d: Date): string {
    return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const host = (e.target as HTMLElement).closest('procurement-date-picker');
    if (!host) this.open.set(false);
  }
}
