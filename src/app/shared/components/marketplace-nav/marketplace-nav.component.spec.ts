import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { MarketplaceNavComponent } from './marketplace-nav.component';
import { MarketplaceUser } from '../../../core/access/marketplace-access';
import { marketplaceUser, provideMarketplaceUser } from '../../testing/marketplace-session';

describe('MarketplaceNavComponent', () => {
  const render = (user: MarketplaceUser) => {
    TestBed.configureTestingModule({
      imports: [MarketplaceNavComponent],
      providers: [provideRouter([]), provideTranslateService(), provideMarketplaceUser(user)],
    });
    const fixture = TestBed.createComponent(MarketplaceNavComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return {
      links: [...el.querySelectorAll('a')].map(a => a.getAttribute('href')),
      text: el.textContent ?? '',
    };
  };

  it('shows viewers the actor tabs', () => {
    expect(render(marketplaceUser('Viewer')).links).toEqual(['/casting', '/actor/applications', '/actor/profile', '/actor/videos']);
  });

  it('shows producers the producer tabs', () => {
    expect(render(marketplaceUser('Producer')).links).toEqual(['/casting', '/producer/actors', '/producer/shortlist', '/producer/casting/new', '/producer/casting', '/producer/applications', '/producer/access']);
  });

  it('shows admins no tabs', () => {
    expect(render(marketplaceUser('Admin')).links).toEqual([]);
  });

  it('tells a suspended producer why the tabs are missing', () => {
    const { links, text } = render(marketplaceUser('Producer', 'suspended'));
    expect(links).toEqual(['/casting']);
    expect(text).toContain('marketplace.access.suspended');
  });
});
