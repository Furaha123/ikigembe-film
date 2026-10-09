import { Component, HostListener, inject, signal, PLATFORM_ID, OnInit, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService, AppLang } from '../../core/services/language.service';
import { ProducerService, ProducerNotification } from '../services/producer.service';
import { MarketplaceAccessService } from '../../core/access/marketplace-access.service';

@Component({
  selector: 'app-producer-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, TranslatePipe],
  templateUrl: './producer-layout.component.html',
  styleUrl: './producer-layout.component.scss'
})
export class ProducerLayoutComponent implements OnInit {
  private readonly authService     = inject(AuthService);
  private readonly producerService = inject(ProducerService);
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
  readonly lang                    = inject(LanguageService);
  private readonly translate       = inject(TranslateService);
  private readonly marketplace     = inject(MarketplaceAccessService);

  readonly initials        = this.authService.initials;
  readonly userName        = this.authService.userName;
  readonly userRole        = this.authService.userRole;
  readonly accountStatus   = this.authService.accountStatus;
  readonly suspensionReason = this.authService.suspensionReason;
  readonly contractSigned  = this.authService.contractSigned;
  /**
   * Films and producer services wait for the one-time setup: profile completed (onboarding, enforced
   * below) and agreement signed. Server-enforced; this only hides the entry points.
   */
  readonly isReady = computed(() => this.accountStatus() === 'active' && this.authService.producerReady());

  isLoggingOut      = signal(false);
  showUserDropdown  = signal(false);
  showNotifDropdown = signal(false);
  showLangDropdown  = signal(false);
  notifications     = signal<ProducerNotification[]>([]);
  statusBannerDismissed = signal(false);
  movieCount        = signal<number>(0);

  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  sidebarOpen = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth > 768 : true
  );

  /** Marketplace items come from the access map (none while the account isn't active). */
  readonly navItems = computed(() => [
    { labelKey: 'nav.dashboard',   path: '/producer/dashboard',   icon: 'dashboard', exact: false },
    ...(this.isReady() ? [{ labelKey: 'nav.upload', path: '/producer/upload', icon: 'upload', exact: false }] : []),
    { labelKey: 'nav.movies',      path: '/producer/movies',      icon: 'movies', exact: false },
    { labelKey: 'nav.wallet',      path: '/producer/wallet',      icon: 'wallet', exact: false },
    { labelKey: 'nav.withdrawals', path: '/producer/withdrawals', icon: 'withdrawals', exact: false },
    { labelKey: 'nav.statements',  path: '/producer/statements',  icon: 'withdrawals', exact: false },
    { labelKey: 'nav.contracts',   path: '/producer/contracts',   icon: 'contracts', exact: false },
    ...this.marketplace.tabs().map(t => ({ labelKey: t.labelKey, path: t.route!, icon: t.icon as string, exact: !!t.exact })),
    { labelKey: 'nav.settings',    path: '/producer/settings',    icon: 'settings', exact: false },
  ]);

  /** Flat nav items structured into labelled groups for the sidebar. */
  readonly navGroups = computed(() => {
    const items = this.navItems();
    const pick = (...icons: string[]) =>
      icons.flatMap(ic => items.filter(i => i.icon === ic));

    const groups: { groupKey?: string; items: ReturnType<typeof pick> }[] = [];

    const dashboard = pick('dashboard');
    if (dashboard.length) groups.push({ items: dashboard });

    const casting = pick('post', 'my-casting', 'inbox');
    if (casting.length) groups.push({ groupKey: 'nav.group.castingManagement', items: casting });

    const talent = pick('actors', 'shortlist');
    if (talent.length) groups.push({ groupKey: 'nav.group.talentDiscovery', items: talent });

    const media = pick('movies', 'upload');
    if (media.length) groups.push({ groupKey: 'nav.group.mediaDistribution', items: media });

    const finance = pick('wallet', 'withdrawals', 'contracts', 'access');
    if (finance.length) groups.push({ groupKey: 'nav.group.financialsAccess', items: finance });

    const settings = pick('settings');
    if (settings.length) groups.push({ items: settings });

    return groups;
  });

  ngOnInit() {
    // Setup and account status are stored hints until /auth/me/ answers.
    this.authService.syncProfile().subscribe();
    if (!this.authService.onboardingComplete()) {
      this.router.navigate(['/producer/onboarding']);
      return;
    }
    this.producerService.getNotifications().subscribe({
      next: (data) => this.notifications.set(data),
    });
    this.producerService.getMovies().subscribe({
      next: (movies) => this.movieCount.set(movies.length),
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!(event.target as HTMLElement).closest('.topbar-user-menu')) {
      this.showUserDropdown.set(false);
    }
    if (!(event.target as HTMLElement).closest('.notif-menu')) {
      this.showNotifDropdown.set(false);
    }
    if (!(event.target as HTMLElement).closest('.lang-menu')) {
      this.showLangDropdown.set(false);
    }
    if (
      isPlatformBrowser(this.platformId) &&
      window.innerWidth <= 768 &&
      this.sidebarOpen() &&
      !(event.target as HTMLElement).closest('.sidebar') &&
      !(event.target as HTMLElement).closest('.toggle-btn')
    ) {
      this.sidebarOpen.set(false);
    }
  }

  toggleUserDropdown(event: Event) {
    event.stopPropagation();
    this.showUserDropdown.update(v => !v);
    if (this.showNotifDropdown()) this.showNotifDropdown.set(false);
    if (this.showLangDropdown()) this.showLangDropdown.set(false);
  }

  toggleNotifDropdown(event: Event) {
    event.stopPropagation();
    this.showNotifDropdown.update(v => !v);
    if (this.showUserDropdown()) this.showUserDropdown.set(false);
    if (this.showLangDropdown()) this.showLangDropdown.set(false);
  }

  toggleLangDropdown(event: Event) {
    event.stopPropagation();
    this.showLangDropdown.update(v => !v);
    if (this.showUserDropdown()) this.showUserDropdown.set(false);
    if (this.showNotifDropdown()) this.showNotifDropdown.set(false);
  }

  selectLanguage(lang: AppLang) {
    this.lang.setLanguage(lang);
    this.showLangDropdown.set(false);
  }

  markAllRead(event: Event) {
    event.stopPropagation();
    this.notifications.update(list => list.map(n => ({ ...n, read: true })));
    this.producerService.markAllNotificationsRead().subscribe();
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }

  closeSidebarOnMobile() {
    if (isPlatformBrowser(this.platformId) && window.innerWidth <= 768) {
      this.sidebarOpen.set(false);
    }
  }

  dismissBanner() { this.statusBannerDismissed.set(true); }

  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/login']);
    });
  }

  notifIcon(type: ProducerNotification['type']): string {
    if (type === 'film_approved' || type === 'account_approved') return 'check';
    if (type === 'film_rejected' || type === 'account_rejected') return 'cross';
    if (type === 'film_changes_requested' || type === 'contract_deadline_missed') return 'warning';
    if (type === 'contract_required' || type === 'contract_expiring' || type === 'contract_expired') return 'contract';
    return 'bell';
  }

  onNotifClick(n: ProducerNotification, event: Event) {
    event.stopPropagation();
    if (!n.read) {
      this.notifications.update(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
      this.producerService.markNotificationRead(n.id).subscribe();
    }
    this.showNotifDropdown.set(false);
    if (n.type === 'contract_required' || n.type === 'contract_expiring' || n.type === 'contract_expired') {
      this.router.navigate(['/producer/contracts/start']);
    } else if (n.type === 'film_changes_requested' || n.type === 'contract_deadline_missed') {
      this.router.navigate(['/producer/movies']);
    }
  }

  relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return this.translate.instant('producerUi.layout.minutesAgo', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return this.translate.instant('producerUi.layout.hoursAgo', { n: hrs });
    return this.translate.instant('producerUi.layout.daysAgo', { n: Math.floor(hrs / 24) });
  }
}
