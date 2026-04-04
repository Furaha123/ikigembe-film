import { Component, HostListener, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  userImg = input.required<string>();

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly initials = this.authService.initials;

  isScrolled = signal(false);
  showDropdown = signal(false);
  isLoggingOut = signal(false);
  navList = [
    { label: 'Home',                route: '/browse' },
    { label: 'My List',             route: '/my-list' },
    { label: 'Browse by Language',  route: null },
  ];

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
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown.update(v => !v);
  }

  logout() {
    this.isLoggingOut.set(true);
    this.authService.logout(() => {
      this.isLoggingOut.set(false);
      this.router.navigate(['/login']);
    });
  }
}
