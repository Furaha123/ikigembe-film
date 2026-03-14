export interface IVideoContent {
  id: number;
  title: string;
  overview: string;
  thumbnail_url: string;
  backdrop_url: string;
  trailer_url: string | null;
  video_url: string | null;
  price: number;
  rating: number;
  release_date: string;
  views: number;
  duration_minutes: number;
  has_free_preview: boolean;
  // legacy compat
  name?: string;
}
