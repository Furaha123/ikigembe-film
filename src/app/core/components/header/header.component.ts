import { Component, HostListener, input, signal } from '@angular/core';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  userImg = input.required<string>();

  username = 'Guest';
  isScrolled = signal(false);

  navList = ['Home', 'TV Shows', 'News & Popular', 'My List', 'Browse by Language'];

  @HostListener('window:scroll')
  onScroll() {
    this.isScrolled.set(window.scrollY > 50);
  }
}
