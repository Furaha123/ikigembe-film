import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { CastingCallDetailComponent } from './casting-call-detail.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile, ActorVideo, CastingApplication, CastingCall } from '../../../shared/models/marketplace.interface';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MARKETPLACE_SESSION } from '../../../core/access/marketplace-access.service';
import { MarketplaceUser } from '../../../core/access/marketplace-access';
import { marketplaceUser, provideMarketplaceUser } from '../../../shared/testing/marketplace-session';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}

const PROFILE = { stage_name: 'Aline', date_of_birth: '2000-01-01', gender: 'female', location: 'Kigali', contact_phone: '0788', contact_email: 'a@b.rw' } as ActorProfile;
const VIDEO = { id: 7, title: 'Monologue', status: 'approved' } as ActorVideo;
const APPLICATION = { id: 3, casting_call_id: 1, status: 'submitted', created_at: '2030-01-01T00:00:00Z' } as CastingApplication;

describe('CastingCallDetailComponent', () => {
  let api: jasmine.SpyObj<ActorMarketplaceService>;
  let fixture: ComponentFixture<CastingCallDetailComponent>;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text));
  const click = (text: string) => { button(text)!.click(); fixture.detectChanges(); };

  beforeEach(() => {
    sessionStorage.clear();
    api = jasmine.createSpyObj('ActorMarketplaceService', ['getCastingCall', 'getMyVideos', 'getProfile', 'getMyApplications', 'apply']);
    api.getMyVideos.and.returnValue(of([VIDEO]));
    api.getProfile.and.returnValue(of(PROFILE));
    api.getMyApplications.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [CastingCallDetailComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
        { provide: ActorMarketplaceService, useValue: api },
        provideMarketplaceUser(marketplaceUser('Viewer')),
      ],
    });
    TestBed.overrideComponent(CastingCallDetailComponent, {
      remove: { imports: [HeaderComponent, FooterComponent] },
      add: { imports: [HeaderStub, FooterStub] },
    });
  });
  afterEach(() => sessionStorage.clear());

  function open(status: CastingCall['status'], deadline = Date.now() + 60000): void {
    api.getCastingCall.and.returnValue(of({
      id: 1, title: 'A role', status, roles: ['Lead'], description: 'Drama', deadline_at: new Date(deadline).toISOString(),
    } as unknown as CastingCall));
    fixture = TestBed.createComponent(CastingCallDetailComponent);
    fixture.detectChanges();
  }

  /** Details → form → review, choosing the video and typing a note. */
  function toReview(note = 'Pick me'): void {
    click('marketplace.casting.apply');
    el().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    const textarea = el().querySelector<HTMLTextAreaElement>('#apply-note')!;
    textarea.value = note;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    click('marketplace.apply.review');
  }

  for (const status of ['closed', 'removed', 'draft'] as const) {
    it(`offers no application for ${status} calls`, () => {
      open(status);
      expect(button('marketplace.casting.apply')).toBeUndefined();
      expect(el().textContent).toContain('marketplace.casting.closed');
      fixture.componentInstance.apply();
      expect(api.apply).not.toHaveBeenCalled();
    });
  }

  it('closes the form when its deadline passes while the page is open', fakeAsync(() => {
    open('published', Date.now() + 1000);
    click('marketplace.casting.apply');
    expect(el().querySelector('#apply-note')).not.toBeNull();
    tick(1000);
    fixture.detectChanges();
    expect(el().querySelector('#apply-note')).toBeNull();
    expect(el().textContent).toContain('marketplace.casting.closed');
    fixture.destroy();
  }));

  it('review → edit returns to the form with every value kept', () => {
    open('published');
    toReview('Pick me');
    expect(el().textContent).toContain('Pick me');
    expect(el().textContent).toContain('Monologue');

    click('marketplace.wizard.edit');
    expect(el().querySelector<HTMLTextAreaElement>('#apply-note')!.value).toBe('Pick me');
    expect(el().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBeTrue();
  });

  it('submits once, ignoring repeated clicks, and confirms only after the server answers', () => {
    open('published');
    toReview();
    const response = new Subject<CastingApplication>();
    api.apply.and.returnValue(response);

    const confirm = button('marketplace.apply.confirm')!;
    confirm.click();
    confirm.click();
    fixture.componentInstance.apply();
    fixture.detectChanges();
    expect(api.apply).toHaveBeenCalledOnceWith(1, { note: 'Pick me', video_ids: [7] });
    expect(el().textContent).not.toContain('marketplace.apply.doneTitle');
    expect(button('marketplace.common.sending')!.disabled).toBeTrue();

    response.next(APPLICATION);
    response.complete();
    fixture.detectChanges();
    expect(el().textContent).toContain('marketplace.apply.doneTitle');
  });

  it('keeps the form on a failed submission so nothing is lost', () => {
    open('published');
    toReview();
    api.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    click('marketplace.apply.confirm');
    expect(el().textContent).toContain('marketplace.casting.applyFailed');
    click('marketplace.wizard.edit');
    expect(el().querySelector<HTMLTextAreaElement>('#apply-note')!.value).toBe('Pick me');
  });

  it('a 409 (already applied elsewhere) shows that application instead of a second one', () => {
    open('published');
    toReview();
    api.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    api.getMyApplications.and.returnValue(of([APPLICATION]));
    click('marketplace.apply.confirm');
    expect(el().textContent).toContain('marketplace.apply.alreadyApplied');
    expect(button('marketplace.casting.apply')).toBeUndefined();
  });

  it('a 404 on submit (closed on the server) shows the call as closed', () => {
    open('published');
    toReview();
    api.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    click('marketplace.apply.confirm');
    expect(el().textContent).toContain('marketplace.casting.closed');
  });

  it('shows an existing application instead of inviting a duplicate', () => {
    api.getMyApplications.and.returnValue(of([APPLICATION]));
    open('published');
    expect(el().textContent).toContain('marketplace.apply.alreadyApplied');
    expect(button('marketplace.casting.apply')).toBeUndefined();
  });

  it('asks for an actor profile first when there is none', () => {
    api.getProfile.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    open('published');
    expect(el().textContent).toContain('marketplace.apply.profileNeeded');
    expect(button('marketplace.casting.apply')).toBeUndefined();
  });

  it('keeps the message as a session draft across a reload', () => {
    open('published');
    toReview('Remember me');
    fixture.destroy();
    open('published');
    click('marketplace.casting.apply');
    expect(el().querySelector<HTMLTextAreaElement>('#apply-note')!.value).toBe('Remember me');
  });

  for (const [label, user] of [
    ['a producer', marketplaceUser('Producer')],
    ['a suspended viewer', marketplaceUser('Viewer', 'suspended')],
  ] as [string, MarketplaceUser][]) {
    it(`shows the call to ${label} without the application or actor-only requests`, () => {
      const provider = provideMarketplaceUser(user) as { useValue: unknown };
      TestBed.overrideProvider(MARKETPLACE_SESSION, { useValue: provider.useValue });
      open('published');
      expect(el().textContent).toContain('A role');
      expect(el().querySelector('#apply-title')).toBeNull();
      expect(api.getMyVideos).not.toHaveBeenCalled();
      expect(api.getProfile).not.toHaveBeenCalled();
      expect(api.getMyApplications).not.toHaveBeenCalled();
      fixture.componentInstance.apply();
      expect(api.apply).not.toHaveBeenCalled();
    });
  }
});
