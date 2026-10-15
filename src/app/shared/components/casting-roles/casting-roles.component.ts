import { Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CastingCall } from '../../models/marketplace.interface';

type RolesSource = Pick<CastingCall, 'id' | 'roles' | 'min_age' | 'max_age' | 'gender_preference' | 'num_actors'>;

/** Requirements a casting call sets for every role (the API has no per-role details). */
export interface RoleRequirement { key: string; params?: Record<string, unknown> }

export function roleRequirements(c: RolesSource): RoleRequirement[] {
  const out: RoleRequirement[] = [];
  const min = c.min_age ?? null;
  const max = c.max_age ?? null;
  if (min !== null && max !== null) out.push({ key: 'marketplace.casting.ageBetween', params: { min, max } });
  else if (min !== null) out.push({ key: 'marketplace.casting.ageFrom', params: { min } });
  else if (max !== null) out.push({ key: 'marketplace.casting.ageUpTo', params: { max } });
  if (c.gender_preference) out.push({ key: 'marketplace.gender.' + c.gender_preference });
  if (c.num_actors) out.push({ key: 'marketplace.casting.actorsNeeded', params: { n: c.num_actors } });
  return out;
}

/**
 * "Open roles" panel on casting call cards: each role as a mini-card, then what applies to every role.
 * `max` caps the roles shown (list cards); the rest are counted in a "+N more" tile.
 */
@Component({
  selector: 'app-casting-roles',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @let c = call();
    @if (c.roles.length || requirements().length) {
        <section class="roles" [attr.aria-labelledby]="'roles-' + c.id">
          <h3 class="roles__label" [id]="'roles-' + c.id">
            {{ 'marketplace.casting.openRoles' | translate }}
            @if (c.roles.length) { <span class="roles__count">{{ c.roles.length }}</span> }
          </h3>

          @if (c.roles.length) {
            <ul class="roles__list" [class.roles__list--single]="c.roles.length === 1">
              @for (r of shown(); track $index) {
                <li class="role">
                  <span class="role__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/>
                    </svg>
                  </span>
                  <span class="role__name" [attr.title]="r">{{ r }}</span>
                </li>
              }
              @if (hidden() > 0) {
                <li class="role role--more">{{ 'marketplace.casting.moreRoles' | translate: { n: hidden() } }}</li>
              }
            </ul>
          }

          @if (requirements().length) {
            <div class="roles__reqs">
              <span class="roles__reqs-label">{{ 'marketplace.casting.everyRole' | translate }}</span>
              @for (q of requirements(); track q.key) {
                <span class="req">{{ q.key | translate: q.params }}</span>
              }
            </div>
          }
        </section>
    }
  `,
  styles: [`
    :host { display: block; }
    .roles {
      padding: .75rem .8rem .8rem;
      border: 1px solid rgba(197, 162, 83, .28);
      border-radius: 10px;
      background: linear-gradient(180deg, rgba(197, 162, 83, .09), rgba(197, 162, 83, .03)), #111113;
    }
    .roles__label {
      display: flex; align-items: center; gap: .45rem; margin: 0 0 .6rem;
      font-size: .7rem; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: #c5a253;
    }
    .roles__count {
      display: inline-grid; place-items: center; min-width: 1.25rem; height: 1.25rem; padding: 0 .35rem;
      border-radius: 999px; background: #c5a253; color: #111; font-size: .68rem; letter-spacing: 0;
    }
    .roles__list {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr)); gap: .45rem;
      margin: 0; padding: 0; list-style: none;
    }
    .roles__list--single { grid-template-columns: 1fr; }
    .role {
      display: flex; align-items: center; gap: .5rem; min-width: 0; min-height: 38px; padding: .4rem .6rem .4rem .45rem;
      border: 1px solid rgba(255, 255, 255, .1); border-radius: 8px; background: #1f1f23;
      color: #fafafa; font-size: .86rem; font-weight: 600; line-height: 1.25;
    }
    .role__icon {
      flex-shrink: 0; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px;
      background: rgba(197, 162, 83, .16); color: #c5a253;
    }
    .role__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .roles__list--single .role__name { white-space: normal; overflow-wrap: anywhere; }
    .role--more {
      justify-content: center; border-style: dashed; background: transparent; color: #a1a1aa; font-weight: 500;
    }
    .roles__reqs {
      display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin-top: .65rem; padding-top: .6rem;
      border-top: 1px solid rgba(255, 255, 255, .07);
    }
    .roles__label + .roles__reqs { margin-top: 0; padding-top: 0; border-top: none; }
    .roles__reqs-label { margin-right: .15rem; font-size: .75rem; color: #a1a1aa; }
    .req {
      padding: .15rem .55rem; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .12);
      background: rgba(255, 255, 255, .05); color: #e4e4e7; font-size: .75rem; white-space: nowrap;
    }
  `],
})
export class CastingRolesComponent {
  readonly call = input.required<RolesSource>();
  /** Most roles to show; the rest become "+N more". Omit to show every role. */
  readonly max = input<number | null>(null);

  readonly requirements = computed(() => roleRequirements(this.call()));
  readonly shown = computed(() => {
    const roles = this.call().roles;
    const cap = this.max();
    // "+1 more" would take the same room as the role itself.
    return cap !== null && roles.length > cap + 1 ? roles.slice(0, cap) : roles;
  });
  readonly hidden = computed(() => (this.call().roles.length) - this.shown().length);
}
