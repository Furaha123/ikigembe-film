/* tslint:disable:no-unused-variable */

import { TestBed, inject } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MovieService } from './movie.service';

describe('Service: Movie', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MovieService, provideHttpClient(), provideHttpClientTesting()]
    });
  });

  it('should ...', inject([MovieService], (service: MovieService) => {
    expect(service).toBeTruthy();
  }));
});
