import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { provideTranslateService } from '@ngx-translate/core';
import { ErrorReferenceComponent } from './error-reference.component';

describe('ErrorReferenceComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [ErrorReferenceComponent], providers: [provideTranslateService()] }));

  it('renders the reference of an error', () => {
    const fixture = TestBed.createComponent(ErrorReferenceComponent);
    fixture.componentRef.setInput('error', new HttpErrorResponse({ status: 500, headers: new HttpHeaders({ 'X-Request-ID': 'abcdef0123456789' }) }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('code')?.textContent).toBe('abcdef0123456789');
  });

  it('renders nothing without a reference', () => {
    const fixture = TestBed.createComponent(ErrorReferenceComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error-reference')).toBeNull();
  });
});
