import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ProviderFeeRulesComponent } from './provider-fee-rules.component';

describe('ProviderFeeRulesComponent', () => {
  let http: HttpTestingController;

  function create() {
    TestBed.configureTestingModule({
      imports: [ProviderFeeRulesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ProviderFeeRulesComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => http.verify());

  it('shows that every fee is unknown while no rule exists', () => {
    const fixture = create();
    http.expectOne(r => r.url.endsWith('/finance/fee-rules/')).flush({ results: [], rounding: 'half up' });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('admin.fees.noRules');
  });

  it('posts a rule with its source and reloads the history', () => {
    const fixture = create();
    http.expectOne(r => r.method === 'GET').flush({ results: [], rounding: 'half up' });
    const c = fixture.componentInstance;
    c.gateway = 'demo';
    c.percent = 2.5;
    c.fixed = 0;
    c.sourceNote = 'demo setting';
    c.save();
    const post = http.expectOne(r => r.method === 'POST');
    expect(post.request.body).toEqual(jasmine.objectContaining({ gateway: 'demo', percent: '2.5', fixed: 0, source_note: 'demo setting' }));
    post.flush({});
    http.expectOne(r => r.method === 'GET').flush({ results: [], rounding: 'half up' });
    expect(c.saved()).toBeTrue();
  });

  it('shows the server validation message', () => {
    const fixture = create();
    http.expectOne(r => r.method === 'GET').flush({ results: [], rounding: '' });
    fixture.componentInstance.save();
    http.expectOne(r => r.method === 'POST').flush({ source_note: ['Say where these numbers come from.'] },
      { status: 400, statusText: 'Bad Request' });
    expect(fixture.componentInstance.error()).toBe('Say where these numbers come from.');
  });
});
