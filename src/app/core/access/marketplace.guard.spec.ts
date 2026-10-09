import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { marketplaceGuard, marketplaceRoute } from './marketplace.guard';
import { MARKETPLACE_SESSION, MarketplaceAccessError, MarketplaceAccessService } from './marketplace-access.service';
import { MarketplaceUser } from './marketplace-access';
import { marketplaceUser, provideMarketplaceUser } from '../../shared/testing/marketplace-session';

@Component({ template: 'page' })
class PageStubComponent {}

const routes = [
  { path: 'casting', component: PageStubComponent, canActivate: [marketplaceGuard], data: marketplaceRoute('casting-calls') },
  { path: 'actor/profile', component: PageStubComponent, canActivate: [marketplaceGuard], data: marketplaceRoute('actor-profile') },
  { path: 'producer/actors', component: PageStubComponent, canActivate: [marketplaceGuard], data: marketplaceRoute('find-actors') },
  { path: 'admin/marketplace', component: PageStubComponent, canActivate: [marketplaceGuard], data: marketplaceRoute('moderation') },
];

describe('marketplaceGuard', () => {
  const open = async (user: MarketplaceUser, url: string) => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideMarketplaceUser(user)] });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  };

  it('lets a viewer open their actor pages', async () => {
    expect(await open(marketplaceUser('Viewer'), '/actor/profile')).toBe('/actor/profile');
  });

  it('redirects a producer away from actor pages to their marketplace home', async () => {
    expect(await open(marketplaceUser('Producer'), '/actor/profile')).toBe('/casting');
  });

  it('redirects a viewer away from producer pages', async () => {
    expect(await open(marketplaceUser('Viewer'), '/producer/actors')).toBe('/casting');
  });

  it('redirects a suspended producer away from producer marketplace pages', async () => {
    expect(await open(marketplaceUser('Producer', 'suspended'), '/producer/actors')).toBe('/casting');
  });

  it('sends admins to moderation instead of the casting pages', async () => {
    expect(await open(marketplaceUser('Admin'), '/casting')).toBe('/admin/marketplace');
  });
});

describe('MarketplaceAccessService.request', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  const setup = (...providers: unknown[]) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...providers as never[]] });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    return TestBed.inject(MarketplaceAccessService);
  };
  afterEach(() => http.verify());

  it('fails without sending when the feature is forbidden', () => {
    const access = setup(provideMarketplaceUser(marketplaceUser('Producer')));
    spyOn(console, 'warn');
    let err: unknown;
    access.request('actor-profile', () => client.get('/api/marketplace/profile/')).subscribe({ error: e => (err = e) });
    http.expectNone('/api/marketplace/profile/');
    expect(err).toEqual(jasmine.any(MarketplaceAccessError));
  });

  it('sends when the feature is allowed', () => {
    const access = setup(provideMarketplaceUser(marketplaceUser('Viewer')));
    access.request('actor-profile', () => client.get('/api/marketplace/profile/')).subscribe();
    http.expectOne('/api/marketplace/profile/').flush({});
  });

  it('waits for the role to be resolved and decides with the resolved role', () => {
    const user = signal<MarketplaceUser | null>(marketplaceUser('Viewer'));
    const resolved = new Subject<void>();
    const access = setup({ provide: MARKETPLACE_SESSION, useValue: { user, resolved: () => resolved } });
    spyOn(console, 'warn');
    let err: unknown;
    access.request('actor-profile', () => client.get('/api/marketplace/profile/')).subscribe({ error: e => (err = e) });
    http.expectNone('/api/marketplace/profile/');

    user.set(marketplaceUser('Producer')); // the stored hint was stale
    resolved.next();
    http.expectNone('/api/marketplace/profile/');
    expect(err).toEqual(jasmine.any(MarketplaceAccessError));
  });
});
