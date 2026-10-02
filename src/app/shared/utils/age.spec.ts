import { ageFromDateOfBirth } from './age';

describe('ageFromDateOfBirth', () => {
  const today = new Date(2026, 9, 2); // 2 Oct 2026

  it('counts whole years, before and after the birthday', () => {
    expect(ageFromDateOfBirth('2000-10-02', today)).toBe(26);
    expect(ageFromDateOfBirth('2000-10-03', today)).toBe(25);
    expect(ageFromDateOfBirth('1996-09-30', today)).toBe(30);
  });

  it('returns null for missing, malformed or future dates', () => {
    expect(ageFromDateOfBirth('', today)).toBeNull();
    expect(ageFromDateOfBirth(null, today)).toBeNull();
    expect(ageFromDateOfBirth('02/10/2000', today)).toBeNull();
    expect(ageFromDateOfBirth('2030-01-01', today)).toBeNull();
  });
});
