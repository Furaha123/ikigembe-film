import { Component, HostListener, inject, input, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  userImg = input.required<string>();

  private readonly authService = inject(AuthService);
  readonly initials = this.authService.initials;

  isScrolled = signal(false);
  navList = ['Home', 'TV Shows', 'News & Popular', 'My List', 'Browse by Language'];

  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 50);
  }
}
