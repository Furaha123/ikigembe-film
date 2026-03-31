import { Component, inject, signal } from '@angular/core';
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
  private readonly router = inject(Router);

  readonly initials = this.authService.initials;
  readonly userName = this.authService.userName;
  isLoggingOut = signal(false);
  sidebarOpen = signal(true);

  navItems = [
    { label: 'Dashboard',   path: '/producer/dashboard',   icon: 'dashboard' },
    { label: 'My Movies',   path: '/producer/movies',      icon: 'movies' },
    { label: 'Wallet',      path: '/producer/wallet',      icon: 'wallet' },
    { label: 'Withdrawals', path: '/producer/withdrawals', icon: 'withdrawals' },
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
