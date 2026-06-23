import { IVideoContent } from './video-content.interface';

export interface MovieListResponse {
  page: number;
  results: IVideoContent[];
  total_results: number;
  total_pages: number;
}

export interface MovieDetailResponse extends IVideoContent {}

export interface TrailerResponse {
  id: number;
  trailer_url: string | null;
}

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
