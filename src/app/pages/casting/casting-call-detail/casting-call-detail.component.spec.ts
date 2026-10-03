import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { CastingCallDetailComponent } from './casting-call-detail.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { CastingCall } from '../../../shared/models/marketplace.interface';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}

describe('CastingCallDetailComponent application availability', () => {
  let api: jasmine.SpyObj<ActorMarketplaceService>;
  let fixture: ComponentFixture<CastingCallDetailComponent>;

  beforeEach(() => {
    api = jasmine.createSpyObj('ActorMarketplaceService', ['getCastingCall', 'getMyVideos', 'apply']);
    api.getMyVideos.and.returnValue(of([]));
    TestBed.configureTestingModule({
      imports: [CastingCallDetailComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
        { provide: ActorMarketplaceService, useValue: api },
      ],
    });
    TestBed.overrideComponent(CastingCallDetailComponent, {
      remove: { imports: [HeaderComponent, FooterComponent] },
      add: { imports: [HeaderStub, FooterStub] },
    });
  });

  function open(status: CastingCall['status'], deadline = Date.now() + 60000): void {
    api.getCastingCall.and.returnValue(of({
      id: 1, title: 'A role', status, roles: [], deadline_at: new Date(deadline).toISOString(),
    } as unknown as CastingCall));
    fixture = TestBed.createComponent(CastingCallDetailComponent);
    fixture.detectChanges();
  }

  for (const status of ['closed', 'removed', 'draft'] as const) {
    it(`hides the application form and blocks requests for ${status} calls`, () => {
      open(status);
      expect(fixture.nativeElement.querySelector('#apply-note')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('marketplace.casting.closed');
      fixture.componentInstance.apply();
      expect(api.apply).not.toHaveBeenCalled();
    });
  }

  it('closes the form when its deadline passes while the page is open', fakeAsync(() => {
    open('published', Date.now() + 1000);
    expect(fixture.nativeElement.querySelector('#apply-note')).not.toBeNull();
    tick(1000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#apply-note')).toBeNull();
    fixture.componentInstance.apply();
    expect(api.apply).not.toHaveBeenCalled();
    fixture.destroy();
  }));

  it('handles a call closed on the server since loading', () => {
    open('published');
    api.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    fixture.componentInstance.apply();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#apply-note')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('marketplace.casting.closed');
  });

  it('shows the submitted state for an existing application', () => {
    open('published');
    api.apply.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    fixture.componentInstance.apply();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('marketplace.casting.applied');
    fixture.componentInstance.apply();
    expect(api.apply).toHaveBeenCalledTimes(1);
  });
});
