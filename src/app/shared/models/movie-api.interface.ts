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
