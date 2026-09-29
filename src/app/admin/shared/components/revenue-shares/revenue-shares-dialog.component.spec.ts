import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { RevenueSharesDialogComponent, splitTotal, totalIs100 } from './revenue-shares-dialog.component';
import { AdminService } from '../../../services/admin.service';
import { FilmRevenueShare, FilmRevenueShareList } from '../../../models/admin.interface';
import { FormControl, FormGroup, FormArray } from '@angular/forms';

const share = (over: Partial<FilmRevenueShare>): FilmRevenueShare => ({
  id: 1, contract_id: 3, contract_version: 2, producer_percentage: 75, platform_percentage: 25, other_parties: [],
  effective_from: '2026-03-01T00:00:00Z', notes: '', created_by: 'admin@ikigembe.rw', created_at: '2026-03-01T00:00:00Z',
  ...over,
});

describe('revenue split validation', () => {
  it('sums producer, platform and other parties', () => {
    expect(splitTotal(80, 15, [{ percentage: 5 }])).toBe(100);
    expect(splitTotal(null, 30, [])).toBe(30);
  });

  it('totalIs100 flags any total other than 100', () => {
    const form = (p: number, q: number, parties: number[]) => new FormGroup({
      producer_percentage: new FormControl(p),
      platform_percentage: new FormControl(q),
      other_parties: new FormArray(parties.map(x => new FormGroup({ percentage: new FormControl(x) }))),
    });
    expect(totalIs100(form(70, 30, []))).toBeNull();
    expect(totalIs100(form(80, 15, [5]))).toBeNull();
    expect(totalIs100(form(80, 15, []))).toEqual({ total: { actual: 95 } });
    expect(totalIs100(form(80, 30, []))).toEqual({ total: { actual: 110 } });
  });
});

describe('RevenueSharesDialogComponent', () => {
  let fixture: ComponentFixture<RevenueSharesDialogComponent>;
  let component: RevenueSharesDialogComponent;
  let admin: jasmine.SpyObj<AdminService>;

  const list = (over: Partial<FilmRevenueShareList> = {}): FilmRevenueShareList => ({
    movie_id: 12, default_producer_percentage: 70, current: null, shares: [], ...over,
  });
  const el = () => fixture.nativeElement as HTMLElement;
  const setNumber = (id: string, value: number) => {
    const input = el().querySelector<HTMLInputElement>(id)!;
    input.value = String(value);
    input.dispatchEvent(new Event('input'));
  };
  const submitBtn = () => el().querySelector<HTMLButtonElement>('button[type="submit"]')!;

  const create = (data: FilmRevenueShareList) => {
    admin.getRevenueShares.and.returnValue(of(data));
    fixture = TestBed.createComponent(RevenueSharesDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('movieId', 12);
    fixture.componentRef.setInput('movieTitle', 'Umurage');
    fixture.detectChanges();
  };

  beforeEach(() => {
    admin = jasmine.createSpyObj<AdminService>('AdminService', ['getRevenueShares', 'createRevenueShare']);
    TestBed.configureTestingModule({
      imports: [RevenueSharesDialogComponent],
      providers: [provideTranslateService(), { provide: AdminService, useValue: admin }],
    });
  });

  it('with no splits shows the default and prefills 70/30 from the API default', () => {
    create(list());
    expect(el().textContent).toContain('70% / 30%');
    expect(component.form.value.producer_percentage).toBe(70);
    expect(component.form.value.platform_percentage).toBe(30);
  });

  it('shows the history as a timeline (newest first) with no edit or delete actions', () => {
    const older = share({ id: 1, producer_percentage: 75, platform_percentage: 25, effective_from: '2026-01-01T00:00:00Z' });
    const newer = share({ id: 2, producer_percentage: 80, platform_percentage: 15, other_parties: [{ name: 'RFO', percentage: 5 }], effective_from: '2026-06-01T00:00:00Z' });
    create(list({ current: newer, shares: [older, newer] }));

    const items = el().querySelectorAll('.rs-timeline li');
    expect(items.length).toBe(3); // two shares + the default line
    expect(items[0].textContent).toContain('80%');
    expect(items[0].textContent).toContain('RFO');
    expect(items[0].classList).toContain('rs-now');
    expect(items[1].textContent).toContain('75%');
    const labels = [...el().querySelectorAll('button')].map(b => b.textContent?.toLowerCase() ?? '');
    expect(labels.some(l => l.includes('edit') || l.includes('delete'))).toBeFalse();
    expect(el().textContent).toContain('admin.revenue.futureOnly');
  });

  it('keeps submit disabled until the split totals 100', () => {
    create(list());
    setNumber('#rs-producer', 80);
    fixture.detectChanges();
    expect(submitBtn().disabled).toBeTrue();
    expect(el().querySelector('.rs-total')?.textContent).toContain('admin.revenue.mustBe100');

    component.addParty();
    fixture.detectChanges();
    el().querySelector<HTMLInputElement>('#rs-party-name-0')!.value = 'Rwanda Film Office';
    el().querySelector<HTMLInputElement>('#rs-party-name-0')!.dispatchEvent(new Event('input'));
    setNumber('#rs-platform', 15);
    setNumber('#rs-party-pct-0', 5);
    fixture.detectChanges();
    expect(component.total()).toBe(100);
    expect(submitBtn().disabled).toBeFalse();
  });

  it('posts the split and reloads the history', () => {
    create(list());
    admin.createRevenueShare.and.returnValue(of(share({ id: 9 })));
    setNumber('#rs-producer', 75);
    setNumber('#rs-platform', 25);
    fixture.detectChanges();

    submitBtn().click();

    expect(admin.createRevenueShare).toHaveBeenCalledOnceWith(12, { producer_percentage: 75, platform_percentage: 25 });
    expect(admin.getRevenueShares).toHaveBeenCalledTimes(2);
  });

  it('sends effective_from as ISO and the optional fields when set', () => {
    create(list());
    admin.createRevenueShare.and.returnValue(of(share({})));
    component.form.patchValue({ producer_percentage: 60, platform_percentage: 40, effective_from: '2030-01-01T10:00', contract_id: 4, notes: ' v3 ' });
    component.save();
    const payload = admin.createRevenueShare.calls.mostRecent().args[1];
    expect(payload.effective_from).toBe(new Date('2030-01-01T10:00').toISOString());
    expect(payload.contract_id).toBe(4);
    expect(payload.notes).toBe('v3');
  });

  it('shows the backend error (e.g. retroactive date)', () => {
    create(list());
    admin.createRevenueShare.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { error: 'effective_from must be after the latest existing share (2026-06-01 00:00).' },
    })));
    component.save();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('after the latest existing share');
  });

  it('shows a DRF field error such as { percentages: [...] }', () => {
    create(list());
    admin.createRevenueShare.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { percentages: ['Percentages must add up to 100 (got 95).'] },
    })));
    component.save();
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('add up to 100');
  });
});
