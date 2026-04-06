import { Component, HostListener, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-producer-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './producer-layout.component.html',
  styleUrl: './producer-layout.component.scss'
})
export class ProducerLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router      = inject(Router);
  private readonly platformId  = inject(PLATFORM_ID);

  readonly initials = this.authService.initials;
  readonly userName = this.authService.userName;
  readonly userRole = this.authService.userRole;

  isLoggingOut     = signal(false);
  showUserDropdown = signal(false);

  sidebarOpen = signal(
    isPlatformBrowser(this.platformId) ? window.innerWidth > 768 : true
  );

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

  navItems = [
    { label: 'Dashboard',   path: '/producer/dashboard',   icon: 'dashboard' },
    { label: 'My Movies',   path: '/producer/movies',      icon: 'movies' },
    { label: 'Wallet',      path: '/producer/wallet',      icon: 'wallet' },
    { label: 'Withdrawals', path: '/producer/withdrawals', icon: 'withdrawals' },
    { label: 'Reports',     path: '/producer/reports',     icon: 'reports' },
    { label: 'Settings',    path: '/producer/settings',    icon: 'settings' },
  ];

  toggleSidebar() { this.sidebarOpen.update(v => !v); }

  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/login']);
    });
  }
}
