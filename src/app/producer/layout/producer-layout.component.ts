import { Component, HostListener, inject, signal, PLATFORM_ID, OnInit, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { LanguageService } from '../../core/services/language.service';
import { ProducerService, ProducerNotification } from '../services/producer.service';

@Component({
  selector: 'app-producer-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, TranslatePipe, TranslateDirective],
  templateUrl: './producer-layout.component.html',
  styleUrl: './producer-layout.component.scss'
})
export class ProducerLayoutComponent implements OnInit {
  private readonly authService     = inject(AuthService);
  private readonly producerService = inject(ProducerService);
  private readonly router          = inject(Router);
  private readonly platformId      = inject(PLATFORM_ID);
  readonly lang                    = inject(LanguageService);

  readonly initials        = this.authService.initials;
  readonly userName        = this.authService.userName;
  readonly userRole        = this.authService.userRole;
  readonly accountStatus   = this.authService.accountStatus;
  readonly suspensionReason = this.authService.suspensionReason;

  isLoggingOut      = signal(false);
  showUserDropdown  = signal(false);
  showNotifDropdown = signal(false);
  notifications     = signal<ProducerNotification[]>([]);
  statusBannerDismissed = signal(false);
  movieCount        = signal<number>(0);

  unreadCount = computed(() => this.notifications().filter(n => !n.read).length);

  sidebarOpen = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth > 768 : true
  );

  navItems = [
    { labelKey: 'nav.dashboard',   path: '/producer/dashboard',   icon: 'dashboard' },
    { labelKey: 'nav.upload',      path: '/producer/upload',      icon: 'upload' },
    { labelKey: 'nav.movies',      path: '/producer/movies',      icon: 'movies' },
    { labelKey: 'nav.wallet',      path: '/producer/wallet',      icon: 'wallet' },
    { labelKey: 'nav.withdrawals', path: '/producer/withdrawals', icon: 'withdrawals' },
    { labelKey: 'nav.reports',     path: '/producer/reports',     icon: 'reports' },
    { labelKey: 'nav.contracts',   path: '/producer/contracts',   icon: 'contracts' },
    { labelKey: 'nav.settings',    path: '/producer/settings',    icon: 'settings' },
  ];

  ngOnInit() {
    if (!this.authService.onboardingComplete()) {
      this.router.navigate(['/producer/onboarding']);
      return;
    }
    // Sync account_status from server so an approved producer sees the correct state on re-login
    this.authService.getMe().subscribe({
      next: (profile) => {
        if (profile.account_status) {
          this.authService.setAccountStatus(profile.account_status as 'pending_approval' | 'approved' | 'suspended');
        }
      },
    });
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
  }

  toggleNotifDropdown(event: Event) {
    event.stopPropagation();
    this.showNotifDropdown.update(v => !v);
    if (this.showUserDropdown()) this.showUserDropdown.set(false);
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
    }
  }

  relativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
