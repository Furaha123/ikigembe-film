import { StreamResponse } from '../models/movie-api.interface';

/** Test fixture for GET /movies/<id>/stream/ (spec-only helper). */
export function makeStreamResponse(overrides: Partial<StreamResponse> = {}): StreamResponse {
  return {
    movie: {
      id: 12, title: 'Umurage', video_url: null, trailer_url: null, subtitles: [],
      duration_minutes: 100, access_granted: true, hls_status: 'ready', hls_url: null,
    },
    stream_url: 'https://api.test/api/movies/12/hls-proxy/master.m3u8?token=abc',
    stream_type: 'hls',
    hls_status: 'ready',
    fallback_url: 'https://r2.test/movie.mp4?X-Amz-Signature=sig',
    subtitles: [
      { id: 3, language_code: 'en', language_name: 'English', url: 'https://r2.test/en.vtt?sig', is_default: true, ordering: 0 },
    ],
    ...overrides,
  };
}
