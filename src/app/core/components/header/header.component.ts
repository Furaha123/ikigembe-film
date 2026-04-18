import {
  Component, HostListener, inject, input, signal,
  ViewChild, ElementRef, OnInit, OnDestroy
} from '@angular/core';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, of, filter } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { MovieService } from '../../../shared/services/movie.service';
import { IVideoContent } from '../../../shared/models/video-content.interface';

@Component({
  selector: 'app-header',
  imports: [RouterLink, CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  userImg = input.required<string>();

  private readonly authService  = inject(AuthService);
  private readonly router       = inject(Router);
  private readonly movieService = inject(MovieService);

  readonly initials = this.authService.initials;

  isScrolled     = signal(false);
  showDropdown   = signal(false);
  isLoggingOut   = signal(false);
  mobileMenuOpen = signal(false);

  searchOpen    = signal(false);
  searchLoading = signal(false);
  searchResults = signal<IVideoContent[]>([]);
  searchQuery   = '';

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private searchSubject = new Subject<string>();
  private searchSub!: Subscription;

  navList = [
    { label: 'Home',                route: '/browse' },
    { label: 'My List',             route: '/my-list' },
    { label: 'Browse by Language',  route: null },
  ];

  ngOnInit() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe(() => this.closeMobileMenu());

    this.searchSub = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        if (!q.trim()) { this.searchResults.set([]); return of(null); }
        this.searchLoading.set(true);
        return this.movieService.search(q).pipe(catchError(() => of(null)));
      })
    ).subscribe(res => {
      this.searchLoading.set(false);
      if (res) this.searchResults.set(res.results ?? []);
    });
  }

  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 50);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu')) {
      this.showDropdown.set(false);
    }
    if (!target.closest('.search-wrapper')) {
      this.closeSearch();
    }
    if (!target.closest('.mobile-drawer') && !target.closest('.hamburger-btn')) {
      this.mobileMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.closeSearch(); }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
    if (this.mobileMenuOpen()) {
      this.showDropdown.set(false);
      this.closeSearch();
    }
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown.update(v => !v);
  }

  toggleSearch(event: Event) {
    event.stopPropagation();
    if (this.searchOpen()) {
      this.closeSearch();
    } else {
      this.searchOpen.set(true);
      setTimeout(() => this.searchInput?.nativeElement.focus(), 50);
    }
  }

  onSearchInput(event: Event) {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.searchSubject.next(this.searchQuery);
  }

  goToMovie(movie: IVideoContent, event: Event) {
    event.stopPropagation();
    this.closeSearch();
    this.router.navigate(['/movie', movie.id]);
  }

  private closeSearch() {
    this.searchOpen.set(false);
    this.searchResults.set([]);
    this.searchLoading.set(false);
    this.searchQuery = '';
    if (this.searchInput?.nativeElement) {
      this.searchInput.nativeElement.value = '';
    }
  }

  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/login']);
    });
  }

  ngOnDestroy() {
    this.searchSub?.unsubscribe();
  }
}
