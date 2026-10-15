import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { TalentSubmitComponent } from './talent-submit.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { MultipartUploadService } from '../../../shared/services/multipart-upload.service';
import { ActorProfile, ActorVideo, MembershipStatus } from '../../../shared/models/marketplace.interface';
import { MultipartUploadApi } from '../../../shared/models/upload.interface';
import { marketplaceUser, provideMarketplaceUser } from '../../../shared/testing/marketplace-session';

@Component({ selector: 'app-header', template: '' })
class HeaderStubComponent { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStubComponent {}

/** A birth date `years` years ago (plus a day, so the birthday has passed). */
const bornYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const profile = (years: number) => ({ stage_name: 'Aline', date_of_birth: bornYearsAgo(years), languages: [], skills: [] } as unknown as ActorProfile);
const newVideo = { id: 9, title: 'Monologue', status: 'pending_upload', payment_status: null, can_upload: true } as ActorVideo;
const membership = (active: boolean): MembershipStatus => ({
  actor: { active, expires_at: active ? '2030-01-01T00:00:00Z' : null },
  producer: { plan: null, expires_at: null, can_view_directory: false, casting_included: false, legacy_search_until: null },
});

describe('TalentSubmitComponent (show your talent)', () => {
  let fixture: ComponentFixture<TalentSubmitComponent>;
  let marketplace: jasmine.SpyObj<ActorMarketplaceService>;
  let uploader: jasmine.SpyObj<MultipartUploadService>;
  const api = {} as MultipartUploadApi;

  const el = () => fixture.nativeElement as HTMLElement;
  const cmp = () => fixture.componentInstance;
  const settle = () => new Promise(r => setTimeout(r));

  /** Jump to the review step with a title and a chosen (unreadable-length) file. */
  async function toReview(): Promise<void> {
    cmp().step.set('video');
    fixture.detectChanges();
    cmp().form.setValue({ title: 'Monologue', description: '' });
    const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    await cmp().onFileSelected({ target: { files: [file], value: '' } } as unknown as Event);
    cmp().toReview();
    fixture.detectChanges();
  }

  beforeEach(() => {
    sessionStorage.clear();
    marketplace = jasmine.createSpyObj<ActorMarketplaceService>('ActorMarketplaceService',
      ['getProfile', 'getMembership', 'createVideo', 'videoUploadApi', 'getMyVideos', 'saveProfile']);
    marketplace.getMembership.and.returnValue(of(membership(true)));
    marketplace.createVideo.and.returnValue(of(newVideo));
    marketplace.videoUploadApi.and.returnValue(api);
    marketplace.getMyVideos.and.returnValue(of([{ ...newVideo, status: 'processing' } as ActorVideo]));
    uploader = jasmine.createSpyObj<MultipartUploadService>('MultipartUploadService', ['upload']);
    uploader.upload.and.resolveTo('key');

    TestBed.configureTestingModule({
      imports: [TalentSubmitComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: ActorMarketplaceService, useValue: marketplace },
        { provide: MultipartUploadService, useValue: uploader },
        provideMarketplaceUser(marketplaceUser('Viewer')),
      ],
    });
    TestBed.overrideComponent(TalentSubmitComponent, {
      remove: { imports: [HeaderComponent, FooterComponent] },
      add: { imports: [HeaderStubComponent, FooterStubComponent] },
    });
  });
  afterEach(() => sessionStorage.clear());

  const create = (p: ActorProfile) => {
    marketplace.getProfile.and.returnValue(of(p));
    fixture = TestBed.createComponent(TalentSubmitComponent);
    fixture.detectChanges();
  };

  it('shows the membership on the welcome step and no fee or tier anywhere', async () => {
    create(profile(25));
    expect(el().textContent).toContain('marketplace.talent.memberUntil');
    await toReview();
    expect(el().textContent).not.toContain('marketplace.talent.tier');
    expect(el().querySelector('.mk-price')).toBeNull();
  });

  it('a non-member is sent to the membership page and cannot upload', async () => {
    marketplace.getMembership.and.returnValue(of(membership(false)));
    create(profile(25));
    expect(el().querySelector('a[href="/actor/membership"]')).not.toBeNull();
    await toReview();
    const upload = [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('marketplace.talent.upload'))!;
    expect(upload.disabled).toBeTrue();
    expect(marketplace.createVideo).not.toHaveBeenCalled();
  });

  it('needs a video before review', () => {
    create(profile(25));
    cmp().step.set('video');
    cmp().form.setValue({ title: 'Monologue', description: '' });
    cmp().toReview();
    fixture.detectChanges();
    expect(cmp().step()).toBe('video');
    expect(el().textContent).toContain('marketplace.talent.fileRequired');
  });

  it('rejects unsupported files before creating a slot', async () => {
    create(profile(25));
    cmp().step.set('video');
    await cmp().onFileSelected({ target: { files: [new File(['x'], 'clip.webm')], value: '' } } as unknown as Event);
    fixture.detectChanges();
    expect(cmp().chosen()).toBeNull();
    expect(cmp().fileError()).toBe('uploadErrors.videoType');
  });

  it('creates the slot (no fee), uploads into it, then shows the server status', async () => {
    create(profile(25));
    await toReview();
    cmp().submit();
    expect(marketplace.createVideo).toHaveBeenCalledOnceWith({ title: 'Monologue', description: undefined });
    expect(marketplace.videoUploadApi).toHaveBeenCalledWith(9);
    expect(uploader.upload).toHaveBeenCalledTimes(1);
    await settle();
    fixture.detectChanges();
    expect(cmp().step()).toBe('done');
    expect(el().textContent).toContain('marketplace.videoStatus.processing');
  });

  it('a membership that ended meanwhile (403 membership_required) shows the membership path', async () => {
    create(profile(25));
    await toReview();
    marketplace.createVideo.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 403, error: { error: 'Membership required.', code: 'membership_required' },
    })));
    cmp().submit();
    fixture.detectChanges();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(cmp().member()).toBeFalse();
    expect(el().querySelector('a[href="/actor/membership"]')).not.toBeNull();
  });

  it('keeps the text draft across a reload and asks for the file again', async () => {
    create(profile(25));
    await toReview();
    fixture.destroy();
    create(profile(25));
    expect(cmp().step()).toBe('video');
    expect(cmp().form.controls.title.value).toBe('Monologue');
    expect(cmp().fileLost()).toBeTrue();
  });
});
