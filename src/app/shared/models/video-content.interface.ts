/**
 * Server-computed availability (apps/movies/release.py): `released` can be bought and streamed;
 * `coming_soon` shows metadata and the trailer only; `unavailable` is only seen by admins/owners.
 */
/** Platform default selling price (RWF), mirrors the API's DEFAULT_FILM_PRICE. Display/default only. */
export const DEFAULT_FILM_PRICE = 1000;

export type ReleaseState = 'released' | 'coming_soon' | 'unavailable';

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
  /** ISO datetime when the full film becomes purchasable and streamable. */
  release_at?: string | null;
  release_state?: ReleaseState;
  /** Credits and language (empty when not provided). */
  director?: string;
  writer?: string;
  original_language?: string;
  cast?: string[];
  genres?: string[];
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
