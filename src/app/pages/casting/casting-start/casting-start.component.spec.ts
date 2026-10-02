import { Component, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { CastingStartComponent } from './casting-start.component';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { AuthService } from '../../../core/services/auth.service';

@Component({ selector: 'app-header', template: '' })
class HeaderStub { @Input() userImg = ''; }
@Component({ selector: 'app-footer', template: '' })
class FooterStub {}

describe('CastingStartComponent', () => {
  let fixture: ComponentFixture<CastingStartComponent>;
  const isLoggedIn = signal(false);
  const userRole = signal('');

  const hrefs = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('a')].map(a => a.getAttribute('href'));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CastingStartComponent],
      providers: [
        provideRouter([]),
        provideTranslateService(),
        { provide: AuthService, useValue: { isLoggedIn, userRole } },
      ],
    });
    TestBed.overrideComponent(CastingStartComponent, {
      remove: { imports: [HeaderComponent, FooterComponent] },
      add: { imports: [HeaderStub, FooterStub] },
    });
  });

  const create = (loggedIn: boolean, role = '') => {
    isLoggedIn.set(loggedIn);
    userRole.set(role);
    fixture = TestBed.createComponent(CastingStartComponent);
    fixture.detectChanges();
  };

  it('sends guests to sign up, with a sign-in link', () => {
    create(false);
    expect(hrefs()).toContain('/register');
    expect(hrefs()).toContain('/login');
    expect(hrefs()).not.toContain('/actor/join');
  });

  it('sends viewers to the actor wizard, casting calls, and their profile to become a producer', () => {
    create(true, 'Viewer');
    expect(hrefs()).toEqual(jasmine.arrayContaining(['/actor/join', '/casting', '/profile']));
    expect(hrefs()).not.toContain('/producer/casting');
  });

  it('gives producers their casting tools', () => {
    create(true, 'Producer');
    expect(hrefs()).toEqual(jasmine.arrayContaining(['/producer/casting', '/producer/actors']));
  });
});
