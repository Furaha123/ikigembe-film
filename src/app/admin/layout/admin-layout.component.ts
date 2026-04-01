import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly initials = this.authService.initials;
  readonly userName = this.authService.userName;
  readonly userRole = this.authService.userRole;
  isLoggingOut = signal(false);
  sidebarOpen = signal(true);

  navItems = [
    { label: 'Dashboard',   path: '/admin/dashboard',   icon: 'dashboard' },
    { label: 'Users',       path: '/admin/users',       icon: 'users' },
    { label: 'Producers',   path: '/admin/producers',   icon: 'producers' },
    { label: 'Movies',      path: '/admin/movies',      icon: 'movies' },
    { label: 'Withdrawals', path: '/admin/withdrawals', icon: 'withdrawals' },
    { label: 'Settings',    path: '/admin/settings',    icon: 'settings' },
  ];

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }
  
  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/admin/login']);
    });
  }
}
