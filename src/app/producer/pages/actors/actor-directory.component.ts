import { Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { CastingService } from '../../services/casting.service';
import {
  ActorGender, ActorSearchAccess, DirectoryActor, DirectoryFilters, Paginated, ShortlistEntry,
} from '../../../shared/models/marketplace.interface';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';

type Tab = 'search' | 'shortlist';

const GENDERS: readonly ActorGender[] = ['female', 'male', 'other'];
const TEXT_FILTERS = ['q', 'location', 'skill', 'language'] as const;

/** Filters from the URL (`?q=…&gender=…&page=2`), ignoring anything malformed. */
export function filtersFromParams(params: ParamMap): DirectoryFilters {
  const f: DirectoryFilters = {};
  for (const key of TEXT_FILTERS) {
    const v = params.get(key)?.trim();
    if (v) f[key] = v.slice(0, 100);
  }
  const gender = params.get('gender');
  if (gender && (GENDERS as readonly string[]).includes(gender)) f.gender = gender as ActorGender;
  for (const key of ['min_age', 'max_age'] as const) {
    const n = Number(params.get(key));
    if (params.get(key) && Number.isInteger(n) && n >= 0 && n <= 120) f[key] = n;
  }
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 1) f.page = page;
  return f;
}

/** URL query params for the filters (empty ones left out). */
export function filtersToParams(f: DirectoryFilters): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || (k === 'page' && v === 1)) continue;
    out[k] = v as string | number;
  }
  return out;
}

/** "21–40" for a page of the server's results (non-last pages are full). */
export function visibleRange(res: Paginated<unknown>): { from: number; to: number } | null {
  if (!res.results.length) return null;
  const isLast = res.page >= res.total_pages;
  const from = isLast ? res.total_results - res.results.length + 1 : (res.page - 1) * res.results.length + 1;
  return { from, to: from + res.results.length - 1 };
}

/**
 * Actor directory and shortlist (/producer/actors, /producer/shortlist).
 * Nothing is requested until `actor-search/access/` reports an active pass;
 * without one the page points to My Access. A 403 later means the pass ended.
 * Search runs on the server, one page at a time, with filters kept in the URL.
 */
@Component({
  selector: 'app-actor-directory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './actor-directory.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss'],
})
export class ActorDirectoryComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly casting = inject(CastingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  readonly genders = GENDERS;

  access        = signal<ActorSearchAccess | null>(null);
  accessLoading = signal(true);
  /** Set when the pass ended mid-session (a 403 from a directory call, or the expiry passed). */
  expired       = signal(false);
  /** /producer/actors or /producer/shortlist (both need an active search pass). */
  readonly tab: Tab = this.route.snapshot.data['tab'] === 'shortlist' ? 'shortlist' : 'search';

  actors      = signal<DirectoryActor[]>([]);
  page        = signal(1);
  totalPages  = signal(0);
  totalCount  = signal(0);
  range       = signal<{ from: number; to: number } | null>(null);
  searching   = signal(false);
  error       = signal<string | null>(null);

  shortlist         = signal<ShortlistEntry[]>([]);
  shortlistedIds    = computed(() => new Set(this.shortlist().map(e => e.actor.id)));
  shortlistBusyId   = signal<number | null>(null);

  filters = this.fb.nonNullable.group({
    q: [''],
    gender: ['' as ActorGender | ''],
    min_age: [null as number | null],
    max_age: [null as number | null],
    location: [''],
    skill: [''],
    language: [''],
  });

  /** Each search replaces the one before it (switchMap cancels the stale request). */
  private readonly searches = new Subject<DirectoryFilters>();
  private expiryTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    const initial = filtersFromParams(this.route.snapshot.queryParamMap);
    this.filters.patchValue({ ...initial, gender: initial.gender ?? '' });
    this.page.set(initial.page ?? 1);

    this.searches.pipe(
      switchMap(f => this.casting.searchActors(f).pipe(
        map(res => ({ res, err: null as HttpErrorResponse | null })),
        catchError((err: HttpErrorResponse) => of({ res: null, err })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ res, err }) => {
      this.searching.set(false);
      if (err || !res) { this.handleError(err!); return; }
      this.actors.set(res.results);
      this.page.set(res.page);
      this.totalPages.set(res.total_pages);
      this.totalCount.set(res.total_results);
      this.range.set(visibleRange(res));
    });

    // Typing in the name box searches after a pause; other filters apply on submit.
    this.filters.controls.q.valueChanges.pipe(
      debounceTime(400),
      map(v => v.trim()),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => { if (this.access()?.active) this.search(1); });

    this.checkAccess();
  }

  ngOnDestroy(): void {
    clearTimeout(this.expiryTimer);
  }

  checkAccess(): void {
    this.accessLoading.set(true);
    this.casting.getSearchAccess().subscribe({
      next: (a) => {
        this.access.set(a);
        this.accessLoading.set(false);
        if (a.active) {
          this.expired.set(false);
          this.scheduleExpiry(a.expires_at);
          if (this.tab === 'search') this.search(this.page());
          this.loadShortlist();
        }
      },
      error: (err: unknown) => {
        this.accessLoading.set(false);
        this.access.set({ active: false, expires_at: null });
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  search(page = 1): void {
    if (!this.access()?.active) return;
    const v = this.filters.getRawValue();
    const f: DirectoryFilters = {
      ...v,
      q: v.q.trim(), location: v.location.trim(), skill: v.skill.trim(), language: v.language.trim(),
      page,
    };
    this.searching.set(true);
    this.error.set(null);
    void this.router.navigate([], { relativeTo: this.route, queryParams: filtersToParams(f), replaceUrl: true });
    this.searches.next(f);
  }

  resetFilters(): void {
    this.filters.reset();
    this.search(1);
  }

  loadShortlist(): void {
    this.casting.getShortlist().subscribe({
      next: (list) => this.shortlist.set(list),
      error: (err: HttpErrorResponse) => this.handleError(err),
    });
  }

  addToShortlist(actor: DirectoryActor): void {
    this.shortlistBusyId.set(actor.id);
    this.casting.addToShortlist(actor.id).subscribe({
      next: () => { this.shortlistBusyId.set(null); this.loadShortlist(); },
      error: (err: HttpErrorResponse) => {
        this.shortlistBusyId.set(null);
        if (err.status === 409) { this.loadShortlist(); return; } // already there
        this.handleError(err);
      },
    });
  }

  removeFromShortlist(actorId: number): void {
    this.shortlistBusyId.set(actorId);
    this.casting.removeFromShortlist(actorId).subscribe({
      next: () => { this.shortlistBusyId.set(null); this.loadShortlist(); },
      error: (err: HttpErrorResponse) => { this.shortlistBusyId.set(null); this.handleError(err); },
    });
  }

  /** A 403 means the pass is gone (expired mid-session): drop the restricted data and show the renewal path. */
  private handleError(err: HttpErrorResponse, done?: () => void): void {
    done?.();
    if (err?.status === 403) {
      this.endAccess();
      return;
    }
    this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
  }

  private endAccess(): void {
    clearTimeout(this.expiryTimer);
    this.expired.set(true);
    this.access.set({ active: false, expires_at: null });
    this.actors.set([]);
    this.shortlist.set([]);
    this.range.set(null);
  }

  /** Hide contact details as soon as the window ends; the server refuses further calls anyway. */
  private scheduleExpiry(expiresAt: string | null): void {
    clearTimeout(this.expiryTimer);
    if (!expiresAt || !isPlatformBrowser(this.platformId)) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms)) return;
    if (ms <= 0) { this.endAccess(); return; }
    this.expiryTimer = setTimeout(() => this.scheduleExpiry(expiresAt), Math.min(ms, 2147483647));
  }
}
