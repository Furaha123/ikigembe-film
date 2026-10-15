import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { CastingRolesComponent, roleRequirements } from './casting-roles.component';
import { CastingCall } from '../../models/marketplace.interface';

type Source = Pick<CastingCall, 'id' | 'roles' | 'min_age' | 'max_age' | 'gender_preference' | 'num_actors'>;

describe('CastingRolesComponent', () => {
  const render = (call: Source, max: number | null = null) => {
    TestBed.configureTestingModule({ imports: [CastingRolesComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(CastingRolesComponent);
    fixture.componentRef.setInput('call', call);
    fixture.componentRef.setInput('max', max);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const names = (el: HTMLElement) => Array.from(el.querySelectorAll('.role__name')).map(n => n.textContent?.trim());

  it('shows every role as a tile with the count, and the shared requirements once', () => {
    const el = render({ id: 1, roles: ['Maid', 'rich person', 'introvert'], min_age: 18, max_age: 30, gender_preference: 'female', num_actors: 3 });
    expect(names(el)).toEqual(['Maid', 'rich person', 'introvert']);
    expect(el.querySelector('.roles__count')?.textContent?.trim()).toBe('3');
    expect(el.querySelector('.roles__list--single')).toBeNull();
    expect(el.querySelectorAll('.req').length).toBe(3);
  });

  it('uses one full-width tile for a single role', () => {
    const el = render({ id: 1, roles: ['Lead'] });
    expect(el.querySelector('.roles__list--single')).not.toBeNull();
    expect(el.querySelector('.roles__reqs')).toBeNull();
  });

  it('caps the tiles and counts the rest, but never hides just one role', () => {
    const roles = ['A', 'B', 'C', 'D', 'E'];
    let el = render({ id: 1, roles }, 3);
    expect(names(el)).toEqual(['A', 'B', 'C']);
    expect(el.querySelector('.role--more')?.textContent).toContain('marketplace.casting.moreRoles');
    TestBed.resetTestingModule();
    el = render({ id: 1, roles: roles.slice(0, 4) }, 3);
    expect(names(el).length).toBe(4);
    expect(el.querySelector('.role--more')).toBeNull();
  });

  it('renders nothing without roles or requirements', () => {
    expect(render({ id: 1, roles: [] }).querySelector('.roles')).toBeNull();
  });

  it('describes open-ended age ranges', () => {
    expect(roleRequirements({ id: 1, roles: [], min_age: 18 })[0].key).toBe('marketplace.casting.ageFrom');
    expect(roleRequirements({ id: 1, roles: [], max_age: 12 })[0].key).toBe('marketplace.casting.ageUpTo');
    expect(roleRequirements({ id: 1, roles: [], min_age: 0, max_age: 5 })[0].params).toEqual({ min: 0, max: 5 });
  });
});
