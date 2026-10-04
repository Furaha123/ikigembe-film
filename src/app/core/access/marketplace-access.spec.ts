import {
  AccountStatus, MARKETPLACE_FEATURES, MarketplaceFeatureKey, Role,
  can, inactiveNoticeFor, marketplaceHomeFor, marketplaceTabsFor, toAccountStatus, toRole,
} from './marketplace-access';
import { marketplaceUser as user } from '../../shared/testing/marketplace-session';

const ROLES: Role[] = ['Viewer', 'Producer', 'Admin'];
const STATUSES: AccountStatus[] = ['active', 'pending_approval', 'suspended'];
const ALL = MARKETPLACE_FEATURES.map(f => f.key);

/** What each role may do with an active account, mirroring the backend permission classes. */
const ACTIVE: Record<Role, MarketplaceFeatureKey[]> = {
  Viewer:   ['casting-calls', 'my-applications', 'actor-profile', 'talent-videos', 'submit-talent', 'apply-casting'],
  Producer: ['casting-calls', 'find-actors', 'shortlist', 'post-casting', 'my-casting-calls', 'casting-applications', 'my-access'],
  Admin:    ['moderation'],
};
/** What survives a pending or suspended account. */
const INACTIVE: Record<Role, MarketplaceFeatureKey[]> = {
  Viewer:   ['casting-calls'],
  Producer: ['casting-calls'],
  Admin:    ['moderation'],
};
const TABS: Record<Role, Record<AccountStatus, string[]>> = {
  Viewer: {
    active: ['/casting', '/actor/applications', '/actor/profile', '/actor/videos'],
    pending_approval: ['/casting'],
    suspended: ['/casting'],
  },
  Producer: {
    active: ['/casting', '/producer/actors', '/producer/shortlist', '/producer/casting/new', '/producer/casting', '/producer/applications', '/producer/access'],
    pending_approval: ['/casting'],
    suspended: ['/casting'],
  },
  Admin: { active: [], pending_approval: [], suspended: [] },
};

describe('marketplace access map', () => {
  for (const role of ROLES) {
    for (const status of STATUSES) {
      describe(`${role} / ${status}`, () => {
        const u = user(role, status);
        const allowed = status === 'active' ? ACTIVE[role] : INACTIVE[role];

        it('can() allows exactly the features the backend allows', () => {
          const granted = ALL.filter(key => can(u, key));
          expect(granted.sort()).toEqual([...allowed].sort());
        });

        it('marketplaceTabsFor() lists only its own tabs, in order', () => {
          expect(marketplaceTabsFor(u).map(t => t.route)).toEqual(TABS[role][status]);
        });

        it('sends forbidden URLs to a page the user can open', () => {
          const home = marketplaceHomeFor(u);
          const feature = MARKETPLACE_FEATURES.find(f => f.route === home)!;
          expect(feature).toBeDefined();
          expect(can(u, feature.key)).toBeTrue();
        });

        it('shows the inactive notice only for non-active viewers and producers', () => {
          const expected = role === 'Admin' || status === 'active' ? null
            : status === 'suspended' ? 'suspended' : 'notActive';
          expect(inactiveNoticeFor(u)).toBe(expected);
        });
      });
    }
  }

  it('never lets a producer reach the actor-only endpoints, or a viewer the producer ones', () => {
    for (const key of ['actor-profile', 'talent-videos', 'submit-talent', 'my-applications', 'apply-casting'] as const) {
      expect(can(user('Producer'), key)).withContext(key).toBeFalse();
    }
    for (const key of ['my-casting-calls', 'post-casting', 'casting-applications', 'my-access', 'find-actors', 'shortlist'] as const) {
      expect(can(user('Viewer'), key)).withContext(key).toBeFalse();
    }
  });

  it('gives admins no actor/producer tabs and keeps moderation out of the tabs', () => {
    expect(marketplaceTabsFor(user('Admin'))).toEqual([]);
    expect(marketplaceHomeFor(user('Admin'))).toBe('/admin/marketplace');
    expect(marketplaceTabsFor(user('Viewer')).some(t => t.key === 'moderation')).toBeFalse();
  });

  it('allows nothing when signed out', () => {
    expect(ALL.filter(key => can(null, key))).toEqual([]);
    expect(marketplaceTabsFor(null)).toEqual([]);
    expect(marketplaceHomeFor(null)).toBe('/login');
    expect(inactiveNoticeFor(null)).toBeNull();
  });

  it('maps backend roles, treating staff as admins', () => {
    expect(toRole('Viewer', false)).toBe('Viewer');
    expect(toRole('Producer', false)).toBe('Producer');
    expect(toRole('Admin', false)).toBe('Admin');
    expect(toRole('Viewer', true)).toBe('Admin');
    expect(toRole(undefined, false)).toBe('Viewer');
  });

  it('normalises account status (missing and the old "approved" mean active)', () => {
    expect(toAccountStatus('suspended')).toBe('suspended');
    expect(toAccountStatus('pending_approval')).toBe('pending_approval');
    expect(toAccountStatus('active')).toBe('active');
    expect(toAccountStatus('approved')).toBe('active');
    expect(toAccountStatus(null)).toBe('active');
  });
});
