import { convertToParamMap } from '@angular/router';
import { catalogFiltersFromParams } from './films.component';

describe('catalog URL filters', () => {
  it('keeps valid filters and defaults the rest', () => {
    const f = catalogFiltersFromParams(convertToParamMap({ q: ' umurage ', genre: 'Drama', year: '2025', sort: 'title', page: '2' }));
    expect(f).toEqual({ q: 'umurage', genre: 'Drama', language: '', year: 2025, availability: 'released', sort: 'title', page: 2 });
  });

  it('drops invalid values', () => {
    const f = catalogFiltersFromParams(convertToParamMap({ sort: 'price', availability: 'secret', year: 'abc', page: '-1' }));
    expect(f.sort).toBe('newest');
    expect(f.availability).toBe('released');
    expect(f.year).toBeNull();
    expect(f.page).toBe(1);
  });
});
