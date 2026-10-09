import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ActorDirectoryComponent, filtersFromParams, filtersToParams, visibleRange } from './actor-directory.component';
import { CastingService } from '../../services/casting.service';
import { DirectoryActor } from '../../../shared/models/marketplace.interface';

const ACTOR: DirectoryActor = {
  id: 5, stage_name: 'Aline', bio: '', gender: 'female', age: 24, location: 'Kigali',
  languages: ['rw'], skills: ['drama'], contact_email: 'aline@example.rw', contact_phone: '0788000000',
};
const page = (results: DirectoryActor[]) => ({ page: 1, results, total_results: results.length, total_pages: 1 });
const forbidden = () => throwError(() => new HttpErrorResponse({ status: 403, error: { error: 'Active actor search access required.' } }));

describe('ActorDirectoryComponent (gated directory)', () => {
  let fixture: ComponentFixture<ActorDirectoryComponent>;
  let casting: jasmine.SpyObj<CastingService>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    casting = jasmine.createSpyObj<CastingService>('CastingService', [
      'getSearchAccess', 'purchaseSearch', 'searchActors', 'getShortlist', 'addToShortlist', 'removeFromShortlist',
    ]);
    casting.searchActors.and.returnValue(of(page([ACTOR])));
    casting.getShortlist.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [ActorDirectoryComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: CastingService, useValue: casting }],
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(ActorDirectoryComponent);
    fixture.detectChanges();
  };

  it('without a pass shows the purchase gate and never queries the directory', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    expect(el().textContent).toContain('marketplace.directory.gateTitle');
    expect(casting.searchActors).not.toHaveBeenCalled();
    expect(el().textContent).not.toContain('aline@example.rw');
  });

  it('without a pass points to My Access (no purchase here)', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    expect(el().querySelector('a[href="/producer/access"]')).not.toBeNull();
    expect(casting.purchaseSearch).not.toHaveBeenCalled();
  });

  it('shows the visible range of the server page', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    casting.searchActors.and.returnValue(of({ page: 2, results: [ACTOR], total_results: 21, total_pages: 2 }));
    create();
    expect(el().textContent).toContain('marketplace.directory.range');
  });

  it('drops actor data when the pass expires while browsing', fakeAsync(() => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: new Date(Date.now() + 5000).toISOString() }));
    create();
    expect(el().textContent).toContain('aline@example.rw');
    tick(5001);
    fixture.detectChanges();
    expect(el().textContent).not.toContain('aline@example.rw');
    expect(el().textContent).toContain('marketplace.directory.gateTitle');
    fixture.destroy();
  }));

  it('with a pass shows the expiry prominently and lists actors with contact details', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    create();
    expect(el().querySelector('.dir-banner[role="status"]')?.textContent).toContain('2030');
    expect(el().textContent).toContain('aline@example.rw');
  });

  it('sends the filters when searching', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    create();
    const q = el().querySelector<HTMLInputElement>('#df-q')!;
    q.value = 'ali';
    q.dispatchEvent(new Event('input'));
    el().querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit'));
    expect(casting.searchActors.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ q: 'ali', page: 1 }));
  });

  it('a 403 mid-session (pass expired) returns to the purchase screen', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    create();
    casting.searchActors.and.returnValue(forbidden());
    el().querySelector<HTMLFormElement>('form[role="search"]')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(el().textContent).toContain('marketplace.directory.expired');
    expect(el().textContent).toContain('marketplace.directory.gateTitle');
    expect(el().textContent).not.toContain('aline@example.rw');
  });

  it('shortlists an actor (409 duplicate is treated as already shortlisted)', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    casting.addToShortlist.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    create();
    const btn = el().querySelector<HTMLButtonElement>('button[aria-label="marketplace.directory.shortlist"]')!;
    btn.click();
    expect(casting.addToShortlist).toHaveBeenCalledOnceWith(5);
    expect(casting.getShortlist).toHaveBeenCalledTimes(2);
  });
});

describe('directory URL filters and range', () => {
  it('reads valid filters from the URL and ignores malformed ones', () => {
    const params = convertToParamMap({ q: ' ali ', gender: 'female', min_age: '20', max_age: 'abc', page: '3', skill: '', bogus: 'x' });
    expect(filtersFromParams(params)).toEqual({ q: 'ali', gender: 'female', min_age: 20, page: 3 });
    expect(filtersFromParams(convertToParamMap({ gender: 'robot', page: '0' }))).toEqual({});
  });

  it('writes only the filters in use', () => {
    expect(filtersToParams({ q: 'ali', gender: '', min_age: null, page: 1 })).toEqual({ q: 'ali' });
    expect(filtersToParams({ location: 'Kigali', page: 2 })).toEqual({ location: 'Kigali', page: 2 });
  });

  it('computes the visible range of a server page', () => {
    const r = (page: number, n: number, total: number, pages: number) =>
      visibleRange({ page, results: Array(n).fill(0), total_results: total, total_pages: pages });
    expect(r(1, 20, 45, 3)).toEqual({ from: 1, to: 20 });
    expect(r(2, 20, 45, 3)).toEqual({ from: 21, to: 40 });
    expect(r(3, 5, 45, 3)).toEqual({ from: 41, to: 45 });
    expect(r(1, 0, 0, 0)).toBeNull();
  });
});

