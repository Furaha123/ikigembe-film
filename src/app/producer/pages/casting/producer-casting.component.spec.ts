import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ProducerCastingComponent } from './producer-casting.component';
import { CastingService } from '../../services/casting.service';
import { CastingCall } from '../../../shared/models/marketplace.interface';

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const call = (over: Partial<CastingCall>): CastingCall => ({
  id: 1, title: 'Umwanzuro series', status: 'published', payment_status: 'Completed', deadline_at: future,
  published_at: '2026-10-01T10:00:00Z', roles: ['Lead'], poster_url: null, review_note: '', removal_reason: '',
  ...over,
} as CastingCall);

describe('ProducerCastingComponent cards', () => {
  let casting: jasmine.SpyObj<CastingService>;
  const render = (calls: CastingCall[], included = false) => {
    casting = jasmine.createSpyObj<CastingService>('CastingService', ['getMyCalls', 'submitCall', 'getQuote', 'publishWithPlan']);
    casting.getMyCalls.and.returnValue(of(calls));
    casting.getQuote.and.returnValue(of({ amount: 5000, currency: 'RWF', access_days: null, included }));
    TestBed.configureTestingModule({
      imports: [ProducerCastingComponent],
      providers: [provideRouter([]), provideTranslateService(), { provide: CastingService, useValue: casting }],
    });
    const fixture = TestBed.createComponent(ProducerCastingComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('keeps the poster box without a poster and shows a published call with its actions', () => {
    const el = render([call({ shooting_location: 'Kigali' })]);
    const card = el.querySelector('.cc-card')!;
    expect(card.querySelector('.cc-card__poster svg')).not.toBeNull();
    expect(card.querySelector('.cc-card__badge')?.classList).toContain('mk-badge--ok');
    expect(card.querySelector('.cc-card__meta')?.textContent).toContain('Kigali');
    expect(card.querySelector('.cc-card__callout')).toBeNull();
    expect(card.classList).not.toContain('cc-card--callout');
    expect(card.querySelectorAll('.cc-card__actions .mk-btn').length).toBe(3);   // applications + edit + close
    expect(card.querySelector('.cc-card__actions a[href$="/edit"]')).not.toBeNull();
  });

  it('puts a removal reason in a red callout and leaves no actions', () => {
    const el = render([call({ status: 'removed', removal_reason: 'incomplete', poster_url: 'https://cdn.example/p.jpg' })]);
    const card = el.querySelector('.cc-card')!;
    expect(card.querySelector('.cc-card__poster img')).not.toBeNull();
    expect(card.classList).toContain('cc-card--callout');
    const callout = card.querySelector('.cc-card__callout')!;
    expect(callout.classList).toContain('cc-card__callout--danger');
    expect(callout.textContent).toContain('incomplete');
    expect(card.querySelector('.cc-card__actions')!.children.length).toBe(0);
  });

  it('publishes a paid draft without a second payment', () => {
    const paid = call({ status: 'draft', published_at: null });
    const el = render([paid]);
    const callout = el.querySelector('.cc-card__callout')!;
    expect(callout.classList).not.toContain('cc-card__callout--danger');
    expect(callout.textContent).toContain('marketplace.publication.paidText');

    casting.submitCall.and.returnValue(of({ ...paid, status: 'published' }));
    const publish = [...el.querySelectorAll<HTMLButtonElement>('.cc-card__actions button')]
      .find(b => b.textContent?.includes('marketplace.postCasting.publishPaid'))!;
    publish.click();
    expect(casting.submitCall).toHaveBeenCalledOnceWith(1);
  });
  it('publishes a draft with no payment when the Full plan covers casting calls', () => {
    const draft = call({ status: 'draft', payment_status: null, published_at: null });
    const el = render([draft], true);
    casting.publishWithPlan.and.returnValue(of({ ...draft, status: 'published' }));
    const publish = [...el.querySelectorAll<HTMLButtonElement>('.cc-card__actions button')]
      .find(b => b.textContent?.includes('marketplace.postCasting.publishIncluded'))!;
    publish.click();
    expect(casting.publishWithPlan).toHaveBeenCalledOnceWith(1);
  });
});
