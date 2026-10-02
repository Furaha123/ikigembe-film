import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CastingCallDetailComponent } from './casting-call-detail.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorNavComponent } from '../../actor/actor-nav/actor-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorProfile, ActorVideo, CastingApplication, CastingCall } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}
@Component({ selector: 'app-actor-nav', template: '' })
class NavStub {}

const call: CastingCall = {
  id: 4, producer_id: 2, producer_name: 'Studio', studio_name: null, title: 'The Last Heritage', description: 'Drama',
  roles: ['Lead'], deadline_at: '2030-01-01T00:00:00Z', status: 'published', published_at: null, payment_status: 'Completed',
  created_at: '', updated_at: '',
};
const profile: ActorProfile = {
  stage_name: 'Aline', bio: '', gender: 'female', location: 'Kigali, Nyarugenge', languages: [], skills: [],
  contact_email: 'aline@example.com', contact_phone: '0781234567', is_listed: true, date_of_birth: '2000-01-01',
  created_at: '', updated_at: '',
};
const approved: ActorVideo = {
  id: 7, actor_id: 1, title: 'Monologue', description: '', status: 'approved', reject_reason: null,
  payment_status: 'Completed', amount: 5000, video_url: null, reviewed_at: null, created_at: '', updated_at: '',
};

describe('CastingCallDetailComponent', () => {
  let fixture: ComponentFixture<CastingCallDetailComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (key: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(key))!;

  beforeEach(() => {
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService', ['getCastingCall', 'getProfile', 'getMyVideos', 'apply']);
    marketplace.getCastingCall.and.returnValue(of(call));
    marketplace.getProfile.and.returnValue(of(profile));
    marketplace.getMyVideos.and.returnValue(of([approved]));

    TestBed.configureTestingModule({
      imports: [CastingCallDetailComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '4' }) } } },
      ],
    });
    TestBed.overrideComponent(CastingCallDetailComponent, {
      remove: { imports: [HeaderComponent, FooterComponent, ActorNavComponent] },
      add: { imports: [HeaderStub, FooterStub, NavStub] },
    });
  });

  const create = () => {
    fixture = TestBed.createComponent(CastingCallDetailComponent);
    fixture.detectChanges();
  };

  it('asks for an actor profile before applying', () => {
    marketplace.getProfile.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    create();
    expect(el().textContent).toContain('marketplace.casting.needProfile');
    expect(el().querySelector('a[href="/actor/join"]')).not.toBeNull();
  });

  it('reviews the profile details and chosen videos before sending', () => {
    create();
    el().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    button('marketplace.casting.reviewApplication').click();
    fixture.detectChanges();

    const text = el().textContent!;
    expect(text).toContain('Aline');
    expect(text).toContain('Kigali, Nyarugenge');
    expect(text).toContain('0781234567');
    expect(text).toContain('Monologue');
    expect(marketplace.apply).not.toHaveBeenCalled();
  });

  it('goes back to edit, then submits and shows the success screen', () => {
    marketplace.apply.and.returnValue(of({} as CastingApplication));
    create();
    el().querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    button('marketplace.casting.reviewApplication').click();
    fixture.detectChanges();

    button('marketplace.common.edit').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.step()).toBe('form');
    expect(el().querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBeTrue();

    button('marketplace.casting.reviewApplication').click();
    fixture.detectChanges();
    button('marketplace.casting.confirmSubmit').click();
    fixture.detectChanges();

    expect(marketplace.apply).toHaveBeenCalledOnceWith(4, { note: undefined, video_ids: [7] });
    expect(el().textContent).toContain('marketplace.casting.applied');
    expect(el().querySelector('a[href="/actor/applications"]')).not.toBeNull();
  });

  it('keeps the review open with the error when sending fails', () => {
    marketplace.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { error: 'Already applied.' } })));
    create();
    button('marketplace.casting.reviewApplication').click();
    fixture.detectChanges();
    button('marketplace.casting.confirmSubmit').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('review');
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Already applied.');
  });
});
