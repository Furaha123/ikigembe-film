import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { ActorDirectoryComponent } from './actor-directory.component';
import { CastingService } from '../../services/casting.service';
import { PaymentModalComponent } from '../../../shared/components/payment-modal/payment-modal.component';
import { DirectoryActor, ServicePurchase } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-payment-modal', template: '' })
class PaymentModalStub {
  @Input() service: ServicePurchase | null = null;
  @Output() paid = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
}

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
  const modal = () => fixture.debugElement.query(d => d.componentInstance instanceof PaymentModalStub)?.componentInstance as PaymentModalStub | undefined;

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
    TestBed.overrideComponent(ActorDirectoryComponent, {
      remove: { imports: [PaymentModalComponent] },
      add: { imports: [PaymentModalStub] },
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

  it('buying opens the payment modal for the search pass, then re-checks access', () => {
    casting.getSearchAccess.and.returnValue(of({ active: false, expires_at: null }));
    create();
    el().querySelector<HTMLButtonElement>('.mk-card .mk-btn')!.click();
    fixture.detectChanges();

    casting.purchaseSearch.and.returnValue(of({ deposit_id: 'd', status: 'Pending', message: '', amount: 1, currency: 'RWF' }));
    modal()!.service!.initiate('0788123456').subscribe();
    expect(casting.purchaseSearch).toHaveBeenCalledOnceWith('0788123456');

    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    modal()!.paid.emit();
    fixture.detectChanges();

    expect(casting.getSearchAccess).toHaveBeenCalledTimes(2);
    expect(casting.searchActors).toHaveBeenCalled();
    expect(el().textContent).toContain('Aline');
  });

  it('with a pass shows the expiry prominently and lists actors with contact details', () => {
    casting.getSearchAccess.and.returnValue(of({ active: true, expires_at: '2030-01-01T00:00:00Z' }));
    create();
    expect(el().querySelector('.mk-banner')?.textContent).toContain('2030');
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
    const btn = [...el().querySelectorAll<HTMLButtonElement>('.mk-grid .mk-btn')].find(b => b.textContent?.includes('marketplace.directory.shortlist'))!;
    btn.click();
    expect(casting.addToShortlist).toHaveBeenCalledOnceWith(5);
    expect(casting.getShortlist).toHaveBeenCalledTimes(2);
  });
});
