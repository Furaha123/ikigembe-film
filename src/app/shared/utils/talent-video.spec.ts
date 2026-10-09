import { TALENT_VIDEO_MAX_BYTES, TALENT_VIDEO_MAX_SECONDS, ageOn, formatDuration, talentFeeTier, talentVideoProblem } from './talent-video';

describe('talent video rules', () => {
  const today = new Date(2026, 9, 4); // 4 Oct 2026, local time

  describe('fee tier (display only; the server quote is the amount)', () => {
    it('is under 30 the day before the 30th birthday', () => {
      expect(ageOn('1996-10-05', today)).toBe(29);
      expect(talentFeeTier('1996-10-05', today)).toBe('under30');
    });

    it('is 30 and over from the 30th birthday', () => {
      expect(ageOn('1996-10-04', today)).toBe(30);
      expect(talentFeeTier('1996-10-04', today)).toBe('from30');
      expect(talentFeeTier('1950-01-01', today)).toBe('from30');
    });

    it('is under 30 for young actors', () => {
      expect(talentFeeTier('2008-02-29', today)).toBe('under30');
    });

    it('is unknown without a readable birth date', () => {
      expect(talentFeeTier('', today)).toBeNull();
      expect(talentFeeTier(null, today)).toBeNull();
      expect(talentFeeTier('04/10/1990', today)).toBeNull();
      expect(talentFeeTier('2030-01-01', today)).toBeNull();
    });
  });

  describe('file checks', () => {
    it('accepts MP4 and MOV, any case (the backend talent formats)', () => {
      for (const name of ['a.mp4', 'b.MOV']) expect(talentVideoProblem(name, 60)).withContext(name).toBeNull();
    });

    it('rejects other types before reading the length', () => {
      for (const name of ['clip.webm', 'photo.jpg', 'c.avi', 'd.mkv']) expect(talentVideoProblem(name, null)).withContext(name).toBe('type');
    });

    it('rejects files over 500 MB', () => {
      expect(talentVideoProblem('a.mp4', 60, TALENT_VIDEO_MAX_BYTES)).toBeNull();
      expect(talentVideoProblem('a.mp4', 60, TALENT_VIDEO_MAX_BYTES + 1)).toBe('tooLarge');
    });

    it('rejects videos over 5 minutes and allows exactly 5', () => {
      expect(TALENT_VIDEO_MAX_SECONDS).toBe(300);
      expect(talentVideoProblem('a.mp4', TALENT_VIDEO_MAX_SECONDS)).toBeNull();
      expect(talentVideoProblem('a.mp4', TALENT_VIDEO_MAX_SECONDS + 5)).toBe('tooLong');
    });

    it('leaves an unreadable length to moderation', () => {
      expect(talentVideoProblem('a.mov', null)).toBeNull();
    });
  });

  it('formats durations', () => {
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(59.6)).toBe('1:00');
  });
});
