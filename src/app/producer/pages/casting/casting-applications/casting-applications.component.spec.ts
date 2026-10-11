import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { CastingApplicationsComponent } from './casting-applications.component';
import { CastingService } from '../../../services/casting.service';
import { CastingApplication } from '../../../../shared/models/marketplace.interface';

const app = (over: Partial<CastingApplication>): CastingApplication => ({
  id: 1, casting_call_id: 5, casting_call_title: 'Lead', actor_id: 9, stage_name: 'Grace Akimana',
  note: 'I can sing.', videos: [], status: 'submitted', created_at: '2026-10-01T10:00:00Z', updated_at: '', ...over,
});

describe('CastingApplicationsComponent applicant cards', () => {
  const render = (apps: CastingApplication[]) => {
    const casting = jasmine.createSpyObj<CastingService>('CastingService', ['getMyCalls', 'getApplications', 'setApplicationStatus']);
    casting.getMyCalls.and.returnValue(of([]));
    casting.getApplications.and.returnValue(of(apps));
    TestBed.configureTestingModule({
      imports: [CastingApplicationsComponent],
      providers: [
        provideRouter([]), provideTranslateService(),
        { provide: CastingService, useValue: casting },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '5' }), queryParamMap: convertToParamMap({}) } } },
      ],
    });
    const fixture = TestBed.createComponent(CastingApplicationsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows initials, a tinted status pill, the note as a quote and one play button per video', () => {
    const el = render([app({
      status: 'shortlisted',
      videos: [{ id: 3, title: 'testing', description: '', video_url: 'https://cdn.example/v.mp4', created_at: '' }],
    })]);
    expect(el.querySelector('.app-card__avatar')?.textContent?.trim()).toBe('GA');
    expect(el.querySelector('.app-card__badge')?.classList).toContain('mk-badge--ok');
    expect(el.querySelector('blockquote.app-card__note')?.textContent).toContain('I can sing.');
    const play = el.querySelectorAll<HTMLButtonElement>('.app-card__video');
    expect(play.length).toBe(1);
    expect(play[0].disabled).toBeFalse();
  });

  it('falls back to "?" and a no-video line for an unnamed actor without videos', () => {
    const el = render([app({ stage_name: null, note: '' })]);
    expect(el.querySelector('.app-card__avatar')?.textContent?.trim()).toBe('?');
    expect(el.querySelector('.app-card__note')).toBeNull();
    expect(el.textContent).toContain('marketplace.producerCasting.noVideos');
  });

  it('builds initials from one or many words', () => {
    render([]);
    const c = TestBed.createComponent(CastingApplicationsComponent).componentInstance;
    expect(c.initials('Grace')).toBe('GR');
    expect(c.initials('  jean de dieu  ')).toBe('JD');
    expect(c.initials('')).toBe('?');
  });
});
