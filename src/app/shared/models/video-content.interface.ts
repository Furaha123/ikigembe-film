export interface IVideoContent {
  id: number;
  title: string;
  overview: string;
  thumbnail_url: string;
  backdrop_url: string;
  trailer_url: string | null;
  /** Signed MP4 URL, or null unless the user is entitled. Never use it for viewer playback — call /stream/. */
  video_url: string | null;
  price: number;
  rating: number;
  release_date: string;
  views: number;
  duration_minutes: number;
  has_free_preview: boolean;
  is_featured?: boolean;
  /** True when the signed-in user holds a usable purchase. Can flip back to false. */
  has_purchased?: boolean;
  // legacy compat
  name?: string;
  // producer attribution (runtime field from backend)
  producer_profile?: { id: number; name: string };
}
