import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AdminMarketplaceComponent } from './admin-marketplace.component';
import { AdminMarketplaceService } from '../../services/admin-marketplace.service';
import { VideoPlayerComponent } from '../../../shared/components/video-player/video-player.component';
import { ActorVideo, CastingCall } from '../../../shared/models/marketplace.interface';

@Component({ selector: 'app-video-player', template: '' })
class PlayerStub { @Input() src = ''; @Input() autoplay = false; }

const VIDEO: ActorVideo = {
  id: 4, actor_id: 1, title: 'Monologue', description: '', status: 'pending_review', reject_reason: null,
  payment_status: 'Completed', amount: 5000, video_url: 'https://r2.test/v.mp4?sig', reviewed_at: null, created_at: '2026-09-01', updated_at: '',
};
const CALL: CastingCall = {
  id: 7, producer_id: 2, producer_name: 'Studio', studio_name: null, title: 'Lead role', description: '', roles: ['Lead'],
  deadline_at: '2030-01-01', status: 'published', published_at: null, payment_status: 'Completed', created_at: '', updated_at: '',
};
const pageOf = <T>(results: T[]) => ({ page: 1, results, total_results: results.length, total_pages: 1 });

describe('AdminMarketplaceComponent (moderation)', () => {
  let fixture: ComponentFixture<AdminMarketplaceComponent>;
  let svc: jasmine.SpyObj<AdminMarketplaceService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string, root: ParentNode = el()) =>
    [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!;
  const dialog = () => el().querySelector('[role="dialog"]') as HTMLElement;
  const typeReason = (value: string) => {
    const ta = el().querySelector<HTMLTextAreaElement>('#am-reason')!;
    ta.value = value;
    ta.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    svc = jasmine.createSpyObj<AdminMarketplaceService>('AdminMarketplaceService', [
      'listActorVideos', 'approveVideo', 'rejectVideo', 'removeVideo', 'listCastingCalls', 'removeCastingCall',
    ]);
    svc.listActorVideos.and.returnValue(of(pageOf([VIDEO])));
    svc.listCastingCalls.and.returnValue(of(pageOf([CALL])));
    svc.approveVideo.and.returnValue(of({ detail: 'ok' }));
    svc.rejectVideo.and.returnValue(of({ detail: 'ok' }));
    svc.removeVideo.and.returnValue(of({ detail: 'ok' }));
    svc.removeCastingCall.and.returnValue(of({ detail: 'ok' }));

    TestBed.configureTestingModule({
      imports: [AdminMarketplaceComponent],
      providers: [provideTranslateService(), { provide: AdminMarketplaceService, useValue: svc }],
    });
    TestBed.overrideComponent(AdminMarketplaceComponent, {
      remove: { imports: [VideoPlayerComponent] },
      add: { imports: [PlayerStub] },
    });
    fixture = TestBed.createComponent(AdminMarketplaceComponent);
    fixture.detectChanges();
  });

  it('loads the pending_review queue', () => {
    expect(svc.listActorVideos).toHaveBeenCalledWith('pending_review', 1);
    expect(el().textContent).toContain('Monologue');
  });

  it('approve goes through a confirmation dialog', () => {
    button('admin.marketplace.approve').click();
    fixture.detectChanges();
    expect(svc.approveVideo).not.toHaveBeenCalled();

    button('admin.marketplace.approve', dialog()).click();
    fixture.detectChanges();
    expect(svc.approveVideo).toHaveBeenCalledOnceWith(4);
    expect(svc.listActorVideos).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
  });

  it('reject requires a reason', () => {
    button('admin.marketplace.reject').click();
    fixture.detectChanges();
    button('admin.marketplace.confirm').click();
    fixture.detectChanges();
    expect(svc.rejectVideo).not.toHaveBeenCalled();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('admin.marketplace.reasonRequired');

    typeReason('Poor audio');
    button('admin.marketplace.confirm').click();
    fixture.detectChanges();
    expect(svc.rejectVideo).toHaveBeenCalledOnceWith(4, 'Poor audio');
    expect(dialog()).toBeNull();
  });

  it('remove video: the reason is optional', () => {
    button('admin.marketplace.remove').click();
    fixture.detectChanges();
    button('admin.marketplace.confirm').click();
    expect(svc.removeVideo).toHaveBeenCalledOnceWith(4, undefined);
  });

  it('shows the backend error inside the dialog', () => {
    svc.rejectVideo.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400, error: { error: 'Only videos pending review can be rejected.' },
    })));
    button('admin.marketplace.reject').click();
    fixture.detectChanges();
    typeReason('x');
    button('admin.marketplace.confirm').click();
    fixture.detectChanges();
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Only videos pending review can be rejected.');
  });

  it('casting calls tab: removal requires a reason', () => {
    button('admin.marketplace.tabCasting').click();
    fixture.detectChanges();
    expect(svc.listCastingCalls).toHaveBeenCalledWith('', 1);
    expect(el().textContent).toContain('Lead role');

    button('admin.marketplace.remove').click();
    fixture.detectChanges();
    button('admin.marketplace.confirm').click();
    expect(svc.removeCastingCall).not.toHaveBeenCalled();

    typeReason('Spam');
    button('admin.marketplace.confirm').click();
    expect(svc.removeCastingCall).toHaveBeenCalledOnceWith(7, 'Spam');
  });
});
