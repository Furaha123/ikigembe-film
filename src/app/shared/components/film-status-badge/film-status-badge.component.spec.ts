import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { FilmStatusBadgeComponent } from './film-status-badge.component';

describe('FilmStatusBadgeComponent', () => {
  let fixture: ComponentFixture<FilmStatusBadgeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilmStatusBadgeComponent], providers: [provideTranslateService()] });
    fixture = TestBed.createComponent(FilmStatusBadgeComponent);
  });

  it('shows the label key and the status class', () => {
    fixture.componentRef.setInput('status', 'draft');
    fixture.detectChanges();
    const badge: HTMLElement = fixture.nativeElement.querySelector('.film-status');
    expect(badge.classList).toContain('film-status--draft');
    expect(badge.textContent).toContain('filmStatus.draft');
  });

  it('adds the Kigali release time for scheduled films only', () => {
    fixture.componentRef.setInput('status', 'scheduled');
    fixture.componentRef.setInput('releaseAt', '2030-12-31T23:30:00Z');
    fixture.detectChanges();
    expect(fixture.componentInstance.scheduledAt()).toBe('1 Jan 2031, 01:30');
    fixture.componentRef.setInput('status', 'published');
    fixture.detectChanges();
    expect(fixture.componentInstance.scheduledAt()).toBe('');
  });
});
