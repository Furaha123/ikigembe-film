import { IVideoContent } from './video-content.interface';

export interface MovieListResponse {
  page: number;
  results: IVideoContent[];
  total_results: number;
  total_pages: number;
}

export interface MovieDetailResponse extends IVideoContent {}

export interface MovieCreditsResponse {
  cast: CastMember[];
}

export interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string;
}

export interface SimilarMoviesResponse {
  results: IVideoContent[];
}

export interface ProducerSummary {
  id: number;
  name: string;
  movie_count: number;
}

export interface ProducersListResponse {
  count: number;
  results: ProducerSummary[];
}

export interface ProducerProfile {
  id: number;
  name: string;
  bio?: string | null;
}

export interface ProducerMoviesResponse {
  producer: ProducerProfile;
  page: number;
  results: IVideoContent[];
  total_results: number;
  total_pages: number;
}

export interface MoviePreview {
  id: number;
  title: string;
  overview: string;
  genre: string;
  genres: string[];
  thumbnail_url: string | null;
  backdrop_url: string | null;
  trailer_url: string | null;
  duration_minutes: number;
  release_date: string;
  rating: number;
  price: number;
  has_free_preview: boolean;
  producer_name: string;
  studio_name: string;
}

export type HlsStatus = 'not_started' | 'processing' | 'ready' | 'failed';

/** Subtitle track. `url` is a short-lived signed URL, or null when the user isn't entitled. */
export interface SubtitleTrack {
  id: number;
  language_code: string;
  language_name: string;
  url: string | null;
  is_default: boolean;
  ordering: number;
}

export type StreamType = 'hls' | 'mp4';

export interface StreamMovie {
  id: number;
  title: string;
  video_url: string | null;
  trailer_url: string | null;
  subtitles: SubtitleTrack[];
  duration_minutes: number | null;
  access_granted: boolean;
  hls_status: HlsStatus;
  hls_url: string | null;
}

/** GET /api/movies/<id>/stream/ — the only supported way for a viewer to play a film. */
export interface StreamResponse {
  movie: StreamMovie;
  stream_url: string;
  stream_type: StreamType;
  hls_status: HlsStatus;
  fallback_url: string | null;
  subtitles: SubtitleTrack[];
}

/**
 * What the video player needs to play a film. Holds signed, expiring URLs:
 * keep it in memory only for the lifetime of the player — never persist it.
 */
export interface PlaybackSource {
  src: string;
  type: StreamType;
  fallbackSrc: string | null;
  subtitles: SubtitleTrack[];
}

/** POST /api/movies/<id>/progress/ — whole seconds; a view is consumed at >= 90 %. */
export interface WatchProgressPayload {
  progress_seconds: number;
  duration_seconds: number;
}

export interface WatchProgressResponse extends WatchProgressPayload {
  movie: number;
  completed: boolean;
  last_watched_at: string | null;
}

export type PlaybackProgressReason = 'interval' | 'pause' | 'ended' | 'close' | 'unload';

/** Emitted by the video player; `unload` means the page is being hidden or closed. */
export interface PlaybackProgress {
  position: number;
  duration: number;
  reason: PlaybackProgressReason;
}
