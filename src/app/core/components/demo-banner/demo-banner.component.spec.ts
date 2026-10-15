import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PaymentService } from '../../services/payment.service';
import { DemoBannerComponent } from './demo-banner.component';

describe('DemoBannerComponent', () => {
  function render(demo: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [DemoBannerComponent],
      providers: [
        provideTranslateService(),
        { provide: PaymentService, useValue: { getConfig: () => of({ gateway: 'dpo', needs_phone: false, redirect: true, demo }) } },
      ],
    });
    const fixture = TestBed.createComponent(DemoBannerComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('labels the whole site while payments are simulated', () => {
    expect(render(true).querySelector('.demo-banner')).not.toBeNull();
  });

  it('renders nothing on a live platform', () => {
    expect(render(false).querySelector('.demo-banner')).toBeNull();
  });
});
