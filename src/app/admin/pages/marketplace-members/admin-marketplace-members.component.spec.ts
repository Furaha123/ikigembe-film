import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AdminMarketplaceMembersComponent, memberFiltersFromParams } from './admin-marketplace-members.component';
import { AdminMarketplaceService, MemberPage, MemberRow } from '../../services/admin-marketplace.service';

const row = (over: Partial<MemberRow> = {}): MemberRow => ({
  user: { id: 1, name: 'Uwase Aline', email: 'aline@example.com', phone_number: '0781234567', role: 'Viewer' },
  plan: 'actor', status: 'active',
  starts_at: '2026-01-10T00:00:00Z', expires_at: '2027-01-10T00:00:00Z', member_since: '2026-01-10T00:00:00Z',
  years_bought: 1, ...over,
});
const page = (results: MemberRow[]): MemberPage => ({
  page: 1, page_size: 25, total_results: results.length, total_pages: 1,
  active: { actor: 4, producer_full: 2, producer_view: 1 }, results,
});

describe('AdminMarketplaceMembersComponent', () => {
  let fixture: ComponentFixture<AdminMarketplaceMembersComponent>;
  let service: jasmine.SpyObj<AdminMarketplaceService>;
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    service = jasmine.createSpyObj<AdminMarketplaceService>('AdminMarketplaceService', ['listMembers', 'exportMembers']);
    service.listMembers.and.returnValue(of(page([
      row(),
      row({ user: { id: 2, name: 'Studio K', email: 'k@example.com', phone_number: null, role: 'Producer' },
            plan: 'producer_full', status: 'upcoming', years_bought: 2 }),
      row({ user: { id: 3, name: '', email: 'old@example.com', phone_number: null, role: 'Viewer' }, status: 'expired' }),
    ])));
    query = new BehaviorSubject(convertToParamMap({ plan: 'actor', status: 'bogus', page: '2' }));
    TestBed.configureTestingModule({
      imports: [AdminMarketplaceMembersComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: AdminMarketplaceService, useValue: service },
        { provide: ActivatedRoute, useValue: { queryParamMap: query } },
      ],
    });
    fixture = TestBed.createComponent(AdminMarketplaceMembersComponent);
    fixture.detectChanges();
  });

  it('reads known filters from the URL and ignores the rest', () => {
    expect(service.listMembers).toHaveBeenCalledWith({ q: '', plan: 'actor', status: '', page: 2 });
    expect(memberFiltersFromParams(convertToParamMap({ plan: 'gold', page: '-1' })))
      .toEqual({ q: '', plan: '', status: '', page: 1 });
  });

  it('shows one row per member with plan, dates and a status badge', () => {
    const rows = el().querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Uwase Aline');
    expect(rows[0].textContent).toContain('aline@example.com');
    expect(rows[0].querySelector('.member-active')?.textContent).toContain('admin.members.status.active');
    expect(rows[1].querySelector('.plan-producer_full')).not.toBeNull();
    expect(rows[1].querySelector('.member-upcoming')).not.toBeNull();
    expect(rows[1].textContent).toContain('admin.members.yearsBought');
    expect(rows[2].textContent).toContain('old@example.com');
    expect(rows[2].querySelector('.member-expired')).not.toBeNull();
  });

  it('a summary card filters to that plan\'s active members through the URL', () => {
    expect(el().querySelector('.member-kpi__value')?.textContent).toContain('4');
    const navigate = spyOn(TestBed.inject(Router), 'navigate');
    el().querySelectorAll<HTMLButtonElement>('.member-kpi')[1].click();
    expect(navigate).toHaveBeenCalledWith([], jasmine.objectContaining({
      queryParams: { plan: 'producer_full', status: 'active', page: null },
    }));
  });

  it('exports the current filters and reports a failure', () => {
    service.exportMembers.and.returnValue(throwError(() => new Error('x')));
    fixture.componentInstance.export();
    fixture.detectChanges();
    expect(service.exportMembers).toHaveBeenCalledWith(jasmine.objectContaining({ plan: 'actor' }));
    expect(el().querySelector('[role=alert]')?.textContent).toContain('admin.members.exportFailed');
  });
});
