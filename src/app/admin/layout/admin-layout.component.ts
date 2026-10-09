import { Component, HostListener, inject, signal, PLATFORM_ID, OnInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Subscription, filter, map } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AdminService } from '../services/admin.service';
import { TranslatePipe } from '@ngx-translate/core';

interface NavItem {
  labelKey: string;
  path: string;
  icon: string;
  activePaths: string[];
  showBadge?: boolean;
}

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, TranslatePipe],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private readonly authService  = inject(AuthService);
  private readonly router       = inject(Router);
  private readonly platformId   = inject(PLATFORM_ID);
  private readonly adminService = inject(AdminService);

  private overviewSub?: Subscription;

  readonly initials = this.authService.initials;
  readonly userName = this.authService.userName;
  readonly userRole = this.authService.userRole;

  isLoggingOut       = signal(false);
  showUserDropdown   = signal(false);
  pendingSubmissions = signal(0);

  sidebarOpen = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth > 768 : true
  );

  /** Reactive current URL — used for multi-path active detection. */
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(e => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly navItems: NavItem[] = [
    {
      labelKey: 'admin.nav.dashboard',
      path: '/admin/dashboard',
      icon: 'dashboard',
      activePaths: ['/admin/dashboard'],
    },
    {
      labelKey: 'admin.nav.userMgmt',
      path: '/admin/users',
      icon: 'users',
      activePaths: ['/admin/users', '/admin/producers'],
    },
    {
      labelKey: 'admin.nav.content',
      path: '/admin/movies',
      icon: 'movies',
      activePaths: ['/admin/movies', '/admin/film-requests', '/admin/transcodes', '/admin/cms'],
      showBadge: true,
    },
    {
      labelKey: 'admin.nav.financials',
      path: '/admin/payments',
      icon: 'withdrawals',
      activePaths: ['/admin/payments', '/admin/finance', '/admin/withdrawals', '/admin/contracts'],
    },
    {
      labelKey: 'admin.nav.marketplace',
      path: '/admin/marketplace',
      icon: 'marketplace',
      activePaths: ['/admin/marketplace'],
    },
    {
      labelKey: 'admin.nav.abuseReports',
      path: '/admin/abuse-reports',
      icon: 'marketplace',
      activePaths: ['/admin/abuse-reports'],
    },
    {
      labelKey: 'admin.nav.reports',
      path: '/admin/reports',
      icon: 'reports',
      activePaths: ['/admin/reports'],
    },
    {
      labelKey: 'admin.nav.auditLog',
      path: '/admin/audit-log',
      icon: 'reports',
      activePaths: ['/admin/audit-log'],
    },
    {
      labelKey: 'admin.nav.settings',
      path: '/admin/platform-settings',
      icon: 'settings',
      activePaths: ['/admin/platform-settings', '/admin/marketplace-settings', '/admin/settings'],
    },
  ];

  ngOnInit(): void {
    this.overviewSub = this.adminService.getOverview().subscribe({
      next: (d) => this.pendingSubmissions.set(d.pending_submissions ?? 0),
      error: () => { /* the badge is optional: keep the last count */ },
    });
  }

  ngOnDestroy(): void {
    this.overviewSub?.unsubscribe();
  }

  isNavActive(paths: string[]): boolean {
    const url = this.currentUrl() ?? '';
    return paths.some(p => url.startsWith(p));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!(event.target as HTMLElement).closest('.topbar-user-menu')) {
      this.showUserDropdown.set(false);
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
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebarOnMobile() {
    if (isPlatformBrowser(this.platformId) && window.innerWidth <= 768) {
      this.sidebarOpen.set(false);
    }
  }

  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/login'], { replaceUrl: true });
    });
  }
}
