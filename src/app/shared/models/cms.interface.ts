// ── CMS pages ───────────────────────────────────────────────────────────

/** GET /api/pages/ item (published pages only). */
export interface CmsPageSummary {
  slug: string;
  title: string;
  updated_at: string;
}

/** GET /api/pages/<slug>/ — `body` is admin-authored HTML; bind with [innerHTML] only. */
export interface CmsPage extends CmsPageSummary {
  body: string;
}

/** Admin read shape (GET/POST/PATCH /api/admin/dashboard/cms/pages/). */
export interface AdminCmsPage extends CmsPage {
  id: number;
  is_published: boolean;
  updated_by: string | null;
  created_at: string;
}

export interface AdminCmsPagePayload {
  slug: string;
  title: string;
  body: string;
  is_published: boolean;
}

// ── Ads ─────────────────────────────────────────────────────────────────

export type AdPlacement = 'home_hero' | 'home_banner' | 'browse_inline' | 'movie_detail' | 'sidebar';

export const AD_PLACEMENTS: AdPlacement[] = ['home_hero', 'home_banner', 'browse_inline', 'movie_detail', 'sidebar'];

/** GET /api/ads/?placement= item — live campaigns, highest priority first. */
export interface Ad {
  id: number;
  name: string;
  creative_url: string | null;
  target_url: string;
  placement: AdPlacement;
}

/** Admin read shape; impressions/clicks/CTR are read-only. */
export interface AdminAd extends Ad {
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  priority: number;
  impressions: number;
  clicks: number;
  /** 0–1 */
  click_through_rate: number;
  created_at: string;
  updated_at: string;
}

/** Sent as multipart/form-data. `creative` is required on create, optional on update. */
export interface AdminAdPayload {
  name: string;
  creative?: File | null;
  target_url: string;
  placement: AdPlacement;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  priority: number;
}
