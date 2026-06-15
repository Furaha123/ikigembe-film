import { Component, HostListener, inject, signal, PLATFORM_ID, OnInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
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

  // Start sidebar closed on mobile so it doesn't push content
  sidebarOpen = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth > 768 : true
  );

  ngOnInit(): void {
    this.overviewSub = this.adminService.getOverview().subscribe({
      next: (d) => this.pendingSubmissions.set(d.pending_submissions ?? 0),
      error: () => {},
    });
  }

  ngOnDestroy(): void {
    this.overviewSub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (!(event.target as HTMLElement).closest('.topbar-user-menu')) {
      this.showUserDropdown.set(false);
    }
    // Close sidebar on mobile when clicking outside
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

  navItems = [
    { label: 'Dashboard',   path: '/admin/dashboard',   icon: 'dashboard' },
    { label: 'Users',       path: '/admin/users',       icon: 'users' },
    { label: 'Producers',   path: '/admin/producers',   icon: 'producers' },
    { label: 'Movies',      path: '/admin/movies',      icon: 'movies' },
    { label: 'Withdrawals', path: '/admin/withdrawals', icon: 'withdrawals' },
    { label: 'Contracts',   path: '/admin/contracts',   icon: 'contracts' },
    { label: 'Reports',     path: '/admin/reports',     icon: 'reports' },
    { label: 'Settings',    path: '/admin/settings',    icon: 'settings' },
  ];

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
