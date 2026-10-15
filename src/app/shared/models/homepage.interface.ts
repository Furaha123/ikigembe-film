import { IVideoContent } from './video-content.interface';

/**
 * Editable home page (API: GET /api/homepage/, admin /api/admin/dashboard/cms/homepage/).
 * Structured fields only — never HTML. Empty hero texts mean "use the built-in translated text".
 */
export type HomeSectionKey =
  | 'new_releases'
  | 'most_watched'
  | 'ad_home_hero'
  | 'genres'
  | 'coming_soon'
  | 'ad_home_banner'
  | 'actors_casting'
  | 'why'
  | 'join_cta';

export interface HomeSection {
  key: HomeSectionKey;
  visible: boolean;
  /** Custom heading (≤ 60); empty = the built-in one. Ignored for ad slots. */
  title: string;
}

export interface HomepageContent {
  hero_title: string;
  hero_description: string;
  featured_movie_id: number | null;
  cta_label: string;
  cta_link: string;
  sections: HomeSection[];
}

/** What the home page renders from (public response, or the admin draft in the preview). */
export interface HomepageView extends HomepageContent {
  published: boolean;
  hero_image_url: string | null;
  /** The configured film (public serializer, no playback URLs), null when unset or no longer listed. */
  featured: IVideoContent | null;
}

export interface HomepageVersion extends HomepageContent {
  id: number;
  status: 'draft' | 'published';
  hero_image_url: string | null;
  featured: IVideoContent | null;
  /** False when the chosen film is no longer listed (publishing will be refused). */
  featured_listed: boolean;
  updated_at: string;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
}

export interface HomepageAdminState {
  draft: HomepageVersion;
  published: HomepageVersion | null;
  defaults: HomepageContent;
  history: { id: number; published_at: string; published_by: string | null }[];
  limits: {
    hero_title: number; hero_description: number; cta_label: number; cta_link: number;
    section_title: number; hero_image_bytes: number;
  };
}

/** Today's home page, in order (mirrors the API's DEFAULT_SECTIONS). */
export const DEFAULT_HOME_SECTIONS: readonly HomeSection[] = [
  { key: 'new_releases', visible: true, title: '' },
  { key: 'most_watched', visible: true, title: '' },
  { key: 'ad_home_hero', visible: true, title: '' },
  { key: 'genres', visible: true, title: '' },
  { key: 'coming_soon', visible: true, title: '' },
  { key: 'ad_home_banner', visible: true, title: '' },
  { key: 'actors_casting', visible: false, title: '' },
  { key: 'why', visible: true, title: '' },
  { key: 'join_cta', visible: true, title: '' },
];

export const HOME_SECTION_KEYS: readonly HomeSectionKey[] = DEFAULT_HOME_SECTIONS.map(s => s.key);

/** Translation key of each section's built-in name (headings and the admin list). */
export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  new_releases: 'home.latest',
  most_watched: 'home.popular',
  ad_home_hero: 'admin.homepage.sections.adHomeHero',
  genres: 'home.genresTitle',
  coming_soon: 'home.comingSoon',
  ad_home_banner: 'admin.homepage.sections.adHomeBanner',
  actors_casting: 'home.actorsCasting.title',
  why: 'home.why.title',
  join_cta: 'home.cta.title',
};

export const HOME_TEXT_LIMITS = {
  heroTitle: 80, heroDescription: 280, ctaLabel: 40, ctaLink: 300, sectionTitle: 60,
} as const;

export const HERO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const HERO_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export function defaultHomepageView(): HomepageView {
  return {
    published: false,
    hero_title: '', hero_description: '', featured_movie_id: null, cta_label: '', cta_link: '',
    hero_image_url: null, featured: null,
    sections: DEFAULT_HOME_SECTIONS.map(s => ({ ...s })),
  };
}

/**
 * Known keys once each, in the given order; missing keys keep their default visibility at the end.
 * Anything unknown is dropped, so a newer API can't make the page render something it doesn't know.
 */
export function normalizeSections(sections: unknown): HomeSection[] {
  const out: HomeSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(sections)) {
    for (const s of sections) {
      if (!s || typeof s !== 'object') continue;
      const { key, visible, title } = s as Partial<HomeSection>;
      if (!key || !HOME_SECTION_KEYS.includes(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ key, visible: !!visible, title: typeof title === 'string' ? title : '' });
    }
  }
  for (const d of DEFAULT_HOME_SECTIONS) {
    if (!seen.has(d.key)) out.push({ ...d });
  }
  return out;
}

/** Read an API response defensively; anything missing falls back to today's home page. */
export function normalizeHomepage(raw: Partial<HomepageView> | null | undefined): HomepageView {
  const base = defaultHomepageView();
  if (!raw || typeof raw !== 'object') return base;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const link = str(raw.cta_link);
  const label = str(raw.cta_label);
  const safe = !!label && isSafeHomeLink(link);
  return {
    published: !!raw.published,
    hero_title: str(raw.hero_title),
    hero_description: str(raw.hero_description),
    featured_movie_id: typeof raw.featured_movie_id === 'number' ? raw.featured_movie_id : null,
    cta_label: safe ? label : '',
    cta_link: safe ? link : '',
    hero_image_url: typeof raw.hero_image_url === 'string' && raw.hero_image_url ? raw.hero_image_url : null,
    featured: raw.featured && typeof raw.featured === 'object' ? raw.featured : null,
    sections: normalizeSections(raw.sections),
  };
}

const INTERNAL_LINKS: RegExp[] = [
  /^\/$/,
  /^\/(films|register|login|browse|producers|actors-casting|casting|about|terms|privacy|contact|refund-policy)$/,
  /^\/movie\/\d{1,10}$/,
  /^\/casting\/\d{1,10}$/,
  /^\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
];

/** True for an internal app path (the API's allow-list). */
export function isInternalHomeLink(link: string): boolean {
  return INTERNAL_LINKS.some(re => re.test(link));
}

/**
 * Client-side mirror of the API's CTA link check: an allowed app path, or an https URL.
 * The API also checks the host against its allow-list; this only keeps the UI from rendering
 * something unsafe (javascript:, data:, protocol-relative …) if a bad value ever arrived.
 */
export function isSafeHomeLink(link: string): boolean {
  if (!link || /[\s\\]/.test(link)) return false;
  if (link.startsWith('/')) return isInternalHomeLink(link);
  try {
    const url = new URL(link);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !!url.hostname;
  } catch {
    return false;
  }
}
