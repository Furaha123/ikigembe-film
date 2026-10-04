/**
 * The one place that decides who may use which marketplace feature.
 *
 * Navigation (tabs, sidebar items), route guards and every request to a
 * role-restricted `/api/marketplace/` endpoint read from FEATURES, so the rules
 * below mirror the backend's permission classes:
 * - actor endpoints: role === 'Viewer' and account_status === 'active'
 * - producer endpoints: role === 'Producer' and account_status === 'active'
 * - published casting calls: any signed-in account
 * - moderation (`/api/marketplace/admin/...`): admins
 * Actors are Viewer accounts; there is no Actor role. Admins only moderate:
 * the actor/producer endpoints check the role alone, so admins can't use them.
 */

export type Role = 'Viewer' | 'Producer' | 'Admin';

/** The backend's `account_status` values. */
export type AccountStatus = 'active' | 'pending_approval' | 'suspended';

export interface MarketplaceUser {
  role: Role;
  accountStatus: AccountStatus;
}

export type MarketplaceFeatureKey =
  | 'casting-calls'
  | 'my-applications'
  | 'actor-profile'
  | 'talent-videos'
  | 'apply-casting'
  | 'submit-talent'
  | 'my-casting-calls'
  | 'post-casting'
  | 'casting-applications'
  | 'find-actors'
  | 'shortlist'
  | 'my-access'
  | 'moderation';

/** Icons the marketplace navigation knows how to draw. */
export type MarketplaceIcon =
  | 'casting' | 'applications' | 'profile' | 'videos' | 'my-casting' | 'post' | 'inbox' | 'actors' | 'shortlist' | 'access' | 'moderation';

export interface MarketplaceFeature {
  key: MarketplaceFeatureKey;
  /** Translation key. */
  labelKey: string;
  /** Page for the feature; features without one are actions inside other pages. */
  route?: string;
  icon?: MarketplaceIcon;
  roles: readonly Role[];
  /** The backend refuses accounts whose status isn't `active`. */
  requiresActive?: boolean;
  /** Shown in the marketplace tabs (moderation lives in the admin dashboard instead). */
  tab?: boolean;
  /** Highlight the tab only on its own URL (another tab lives below it). */
  exact?: boolean;
}

/** In tab order: viewers and producers each see theirs in this order. */
export const MARKETPLACE_FEATURES: readonly MarketplaceFeature[] = [
  { key: 'casting-calls',        labelKey: 'marketplace.nav.casting',        route: '/casting',                icon: 'casting',      roles: ['Viewer', 'Producer'], tab: true },
  { key: 'my-applications',      labelKey: 'marketplace.nav.applications',   route: '/actor/applications',     icon: 'applications', roles: ['Viewer'],   requiresActive: true, tab: true },
  { key: 'actor-profile',        labelKey: 'marketplace.nav.profile',        route: '/actor/profile',          icon: 'profile',      roles: ['Viewer'],   requiresActive: true, tab: true },
  { key: 'talent-videos',        labelKey: 'marketplace.nav.videos',         route: '/actor/videos',           icon: 'videos',       roles: ['Viewer'],   requiresActive: true, tab: true },
  { key: 'submit-talent',        labelKey: 'marketplace.nav.submitTalent',   route: '/actor/talent/new',                             roles: ['Viewer'],   requiresActive: true },
  { key: 'apply-casting',        labelKey: 'marketplace.casting.apply',                                                                roles: ['Viewer'],   requiresActive: true },
  { key: 'find-actors',          labelKey: 'marketplace.nav.findActors',     route: '/producer/actors',        icon: 'actors',       roles: ['Producer'], requiresActive: true, tab: true },
  { key: 'shortlist',            labelKey: 'marketplace.nav.shortlist',      route: '/producer/shortlist',     icon: 'shortlist',    roles: ['Producer'], requiresActive: true, tab: true },
  { key: 'post-casting',         labelKey: 'marketplace.nav.postCasting',    route: '/producer/casting/new',   icon: 'post',         roles: ['Producer'], requiresActive: true, tab: true },
  { key: 'my-casting-calls',     labelKey: 'marketplace.nav.myCastingCalls', route: '/producer/casting',       icon: 'my-casting',   roles: ['Producer'], requiresActive: true, tab: true, exact: true },
  { key: 'casting-applications', labelKey: 'marketplace.nav.castingApplications', route: '/producer/applications', icon: 'inbox',   roles: ['Producer'], requiresActive: true, tab: true },
  { key: 'my-access',            labelKey: 'marketplace.nav.myAccess',       route: '/producer/access',        icon: 'access',       roles: ['Producer'], requiresActive: true, tab: true },
  { key: 'moderation',           labelKey: 'admin.nav.marketplace',          route: '/admin/marketplace',      icon: 'moderation',   roles: ['Admin'] },
];

const BY_KEY = new Map(MARKETPLACE_FEATURES.map(f => [f.key, f]));

export function marketplaceFeature(key: MarketplaceFeatureKey): MarketplaceFeature {
  return BY_KEY.get(key)!;
}

/** The status the backend means by "active"; a missing status is the backend default. */
export function isActiveAccount(user: MarketplaceUser): boolean {
  return user.accountStatus === 'active';
}

/** Whether `user` (null when signed out) may open the feature or call its endpoints. */
export function can(user: MarketplaceUser | null, key: MarketplaceFeatureKey): boolean {
  const feature = BY_KEY.get(key);
  if (!user || !feature || !feature.roles.includes(user.role)) return false;
  return !feature.requiresActive || isActiveAccount(user);
}

/** The marketplace tabs/sidebar items for `user`, in display order. Forbidden ones are left out. */
export function marketplaceTabsFor(user: MarketplaceUser | null): MarketplaceFeature[] {
  return MARKETPLACE_FEATURES.filter(f => f.tab && can(user, f.key));
}

/** Where a forbidden marketplace URL sends the user. */
export function marketplaceHomeFor(user: MarketplaceUser | null): string {
  if (!user) return '/login';
  if (user.role === 'Admin') return marketplaceFeature('moderation').route!;
  return marketplaceTabsFor(user)[0]?.route ?? '/browse';
}

/**
 * The notice to show instead of features that would all answer 403, or null.
 * Admins aren't subject to the status check.
 */
export function inactiveNoticeFor(user: MarketplaceUser | null): 'suspended' | 'notActive' | null {
  if (!user || user.role === 'Admin' || isActiveAccount(user)) return null;
  return user.accountStatus === 'suspended' ? 'suspended' : 'notActive';
}

/** Role as the marketplace sees it: staff accounts are admins, as on the backend. */
export function toRole(role: string | null | undefined, isStaff: boolean): Role {
  if (isStaff || role === 'Admin') return 'Admin';
  return role === 'Producer' ? 'Producer' : 'Viewer';
}

/** Normalises a stored or received status; `approved` is an old frontend-only spelling of `active`. */
export function toAccountStatus(status: string | null | undefined): AccountStatus {
  if (status === 'suspended' || status === 'pending_approval') return status;
  return 'active';
}
