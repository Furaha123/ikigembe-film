import {
  Component, DestroyRef, HostListener, inject, input, signal, computed,
  ViewChild, ElementRef, OnInit, OnDestroy
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LanguageService } from '../../services/language.service';
import { RETURN_URL_PARAM, safeReturnUrl } from '../../../shared/utils/safe-redirect';
import { CommonModule, DOCUMENT } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription } from 'rxjs';
import { distinctUntilChanged, switchMap, catchError, of, filter, timer, map } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { MarketplaceAccessService } from '../../access/marketplace-access.service';
import { MovieService } from '../../../shared/services/movie.service';
import { InboxService, UserNotification } from '../../services/inbox.service';
import { IVideoContent } from '../../../shared/models/video-content.interface';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, CommonModule, TranslatePipe],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit, OnDestroy {
  userImg = input.required<string>();

  private readonly authService  = inject(AuthService);
  private readonly destroyRef   = inject(DestroyRef);
  private readonly router       = inject(Router);
  private readonly movieService = inject(MovieService);
  private readonly inboxService = inject(InboxService);
  private readonly translate    = inject(TranslateService);
  private readonly document     = inject(DOCUMENT);
  private readonly marketplace  = inject(MarketplaceAccessService);
  readonly lang                 = inject(LanguageService);

  readonly isLoggedIn     = this.authService.isLoggedIn;

  readonly initials       = this.authService.initials;
  readonly isAdmin        = this.authService.isAdmin;
  readonly userRole       = this.authService.userRole;
  readonly dashboardRoute = computed(() =>
    this.authService.isAdmin() ? '/admin/dashboard' : '/producer/dashboard'
  );
  // Producers and admins keep their settings inside their dashboard, which has its own navigation.
  readonly settingsRoute = computed(() =>
    this.authService.isAdmin() ? '/admin/settings'
      : this.authService.userRole() === 'Producer' ? '/producer/settings'
      : '/profile'
  );

  isScrolled     = signal(false);
  showDropdown   = signal(false);
  isLoggingOut   = signal(false);
  mobileMenuOpen = signal(false);

  searchOpen    = signal(false);
  searchLoading = signal(false);
  searchResults = signal<IVideoContent[]>([]);
  searchQuery   = '';

  // ── Inbox ──────────────────────────────────────────
  showInbox   = signal(false);
  inboxItems  = signal<UserNotification[]>([]);
  unreadCount = signal(0);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('searchToggle') searchToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('accountToggle') accountToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('inboxToggle') inboxToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('mobileToggle') mobileToggle?: ElementRef<HTMLButtonElement>;
  private searchFocusTimer?: ReturnType<typeof setTimeout>;

  private searchSubject = new Subject<string>();
  private searchSub!: Subscription;

  /**
   * Guests get only the catalog (the logo is home; producer and casting links are in the footer).
   * Signed-in accounts also get My List, Producers and, where the marketplace map allows (not admins), Actors Casting.
   */
  readonly navList = computed<{ label: string; labelKey?: string; route: string | null }[]>(() =>
    !this.isLoggedIn()
      ? [{ label: 'Films', labelKey: 'header.nav.films', route: '/films' }]
      : [
          { label: 'Home',      labelKey: 'header.nav.home',      route: '/browse' },
          { label: 'Films',     labelKey: 'header.nav.films',     route: '/films' },
          { label: 'My List',   labelKey: 'header.nav.myList',    route: '/my-list' },
          { label: 'Producers', labelKey: 'header.nav.producers', route: '/producers' },
          ...(this.marketplace.can('casting-calls')
            ? [{ label: 'Actors Casting', labelKey: 'header.nav.actorsCasting', route: '/actors-casting' }]
            : []),
        ]);

  ngOnInit() {
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.closeMobileMenu());

    this.searchSub = this.searchSubject.pipe(
      map(q => q.trim()),
      distinctUntilChanged(),
      switchMap(q => {
        this.searchResults.set([]);
        this.searchLoading.set(!!q);
        if (!q) return of(null);
        return timer(300).pipe(
          switchMap(() => this.movieService.search(q)),
          catchError(() => of(null)),
        );
      })
    ).subscribe(res => {
      this.searchLoading.set(false);
      if (res) this.searchResults.set(res.results ?? []);
    });

    // Guests have no inbox (the call only produced a 401).
    if (this.isLoggedIn()) this.loadInbox();
  }

  /** Sign-in link that brings the guest back to this page. */
  signInParams() {
    const here = safeReturnUrl(this.router.url);
    return here ? { [RETURN_URL_PARAM]: here } : {};
  }

  toggleLanguage() {
    this.lang.toggle();
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
    if (!target.closest('.inbox-wrapper')) {
      this.showInbox.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    const active = this.document.activeElement;
    const trigger = active?.closest('.search-wrapper') ? this.searchToggle
      : active?.closest('.user-menu') ? this.accountToggle
      : active?.closest('.inbox-wrapper') ? this.inboxToggle
      : active?.closest('.mobile-drawer') ? this.mobileToggle : undefined;
    this.closeSearch();
    this.showInbox.set(false);
    this.showDropdown.set(false);
    this.closeMobileMenu();
    trigger?.nativeElement.focus();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
    if (this.mobileMenuOpen()) {
      this.showDropdown.set(false);
      this.showInbox.set(false);
      this.closeSearch();
    }
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown.update(v => !v);
    if (this.showDropdown()) this.showInbox.set(false);
  }

  toggleSearch(event: Event) {
    event.stopPropagation();
    if (this.searchOpen()) {
      this.closeSearch();
    } else {
      this.showInbox.set(false);
      this.searchOpen.set(true);
      this.searchFocusTimer = setTimeout(() => {
        if (this.searchOpen()) this.searchInput?.nativeElement.focus();
      }, 50);
    }
  }

  onSearchInput(event: Event) {
    this.searchQuery = (event.target as HTMLInputElement).value;
    this.searchSubject.next(this.searchQuery);
  }

  /** Enter: every result, paginated and filterable, on the catalog page. */
  openFullSearch(): void {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.router.navigate(['/films'], { queryParams: { q } });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchSubject.next('');
    if (this.searchInput?.nativeElement) this.searchInput.nativeElement.value = '';
  }

  goToMovie(movie: IVideoContent, event: Event) {
    event.stopPropagation();
    this.closeSearch();
    this.router.navigate(['/movie', movie.id]);
  }

  // ── Inbox ──────────────────────────────────────────
  loadInbox(): void {
    this.inboxService.getInbox().subscribe({
      next: (resp) => {
        this.inboxItems.set(resp.results);
        this.unreadCount.set(resp.unread_count);
      },
      error: () => { /* the inbox is optional: keep what is shown */ },
    });
  }

  toggleInbox(event: Event): void {
    event.stopPropagation();
    this.showInbox.update(v => !v);
    if (this.showInbox()) {
      this.showDropdown.set(false);
      this.closeSearch();
    }
  }

  onNotifClick(n: UserNotification): void {
    if (!n.read) {
      this.inboxService.markRead(n.id).subscribe();
      this.inboxItems.update(list =>
        list.map(item => item.id === n.id ? { ...item, read: true } : item)
      );
      this.unreadCount.update(c => Math.max(0, c - 1));
    }
    this.showInbox.set(false);
    if (n.movie_id !== null) {
      this.router.navigate(['/movie', n.movie_id]);
    }
  }

  markAllInboxRead(event: Event): void {
    event.stopPropagation();
    this.inboxService.markAllRead().subscribe(() => {
      this.inboxItems.update(list => list.map(n => ({ ...n, read: true })));
      this.unreadCount.set(0);
    });
  }

  notifTypeIcon(type: UserNotification['type']): string {
    if (type === 'payment_confirmed') return 'check';
    if (type === 'payment_failed')    return 'warning';
    if (type === 'new_trailer')       return 'play';
    return 'film';
  }

  relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return this.translate.instant('header.time.justNow');
    if (mins < 60) return this.translate.instant('header.time.minutesAgo', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return this.translate.instant('header.time.hoursAgo', { n: hrs });
    return this.translate.instant('header.time.daysAgo', { n: Math.floor(hrs / 24) });
  }

  private closeSearch() {
    clearTimeout(this.searchFocusTimer);
    this.clearSearch();
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
    clearTimeout(this.searchFocusTimer);
    this.searchSub?.unsubscribe();
  }
}
