import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { HeaderComponent } from './header.component';
import { MovieService } from '../../../shared/services/movie.service';
import { MovieListResponse } from '../../../shared/models/movie-api.interface';
import { Subject } from 'rxjs';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideTranslateService()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('cancels a pending search when cleared and allows the same query again', fakeAsync(() => {
    const response = new Subject<MovieListResponse>();
    const search = spyOn(TestBed.inject(MovieService), 'search').and.returnValue(response);
    const input = fixture.nativeElement.querySelector('.search-input') as HTMLInputElement;
    input.value = 'Film';
    input.dispatchEvent(new Event('input'));
    tick(300);
    expect(search).toHaveBeenCalledTimes(1);
    component.clearSearch();
    response.next({ page: 1, results: [{ id: 1, title: 'Stale' } as MovieListResponse['results'][number]], total_results: 1, total_pages: 1 });
    expect(component.searchResults()).toEqual([]);
    expect(component.searchLoading()).toBeFalse();
    input.value = 'Film';
    input.dispatchEvent(new Event('input'));
    tick(300);
    expect(search).toHaveBeenCalledTimes(2);
  }));

  it('keeps collapsed search controls inert and closes all menus on Escape', () => {
    expect(fixture.nativeElement.querySelector('#header-search').hasAttribute('inert')).toBeTrue();
    component.searchOpen.set(true);
    component.showDropdown.set(true);
    component.mobileMenuOpen.set(true);
    component.onEscape();
    expect(component.searchOpen()).toBeFalse();
    expect(component.showDropdown()).toBeFalse();
    expect(component.mobileMenuOpen()).toBeFalse();
  });

  it('returns focus to the menu button when Escape closes the mobile menu', () => {
    document.body.appendChild(fixture.nativeElement);
    component.mobileMenuOpen.set(true);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('#mobile-navigation a, #mobile-navigation button') as HTMLElement;
    link.focus();
    component.onEscape();
    fixture.detectChanges();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.hamburger-btn'));
    fixture.nativeElement.remove();
  });
});
