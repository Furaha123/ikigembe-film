import {
  Component, DestroyRef, OnInit, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { HeaderComponent } from '../../../core/components/header/header.component';
import { FooterComponent } from '../../../core/components/footer/footer.component';
import { MarketplaceNavComponent } from '../../../shared/components/marketplace-nav/marketplace-nav.component';
import { ActorMarketplaceService } from '../../../shared/services/actor-marketplace.service';
import { ActorGender, CastingCall } from '../../../shared/models/marketplace.interface';
import { RWANDA_PROVINCES } from '../../../shared/models/rwanda-locations';
import { marketplaceErrorMessage } from '../../../shared/utils/marketplace-error';
import { castingDisplayStatus, castingCallStatusClass } from '../../../shared/utils/marketplace-status';

const GENDERS: readonly ActorGender[] = ['female', 'male', 'other'];

@Component({
  selector: 'app-casting-calls',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, HeaderComponent, FooterComponent, MarketplaceNavComponent],
  templateUrl: './casting-calls.component.html',
  styleUrls: ['../../../shared/styles/marketplace-page.scss', './casting-calls.component.scss'],
})
export class CastingCallsComponent implements OnInit {
  readonly displayStatus = castingDisplayStatus;
  readonly statusClass = castingCallStatusClass;
  readonly genders = GENDERS;
  readonly provinces = RWANDA_PROVINCES;

  private readonly marketplace = inject(ActorMarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  private readonly searchSubject = new Subject<string>();

  calls       = signal<CastingCall[]>([]);
  page        = signal(1);
  totalPages  = signal(0);
  total       = signal(0);
  loading     = signal(true);
  error       = signal<string | null>(null);
  searchValue = signal('');

  filters = this.fb.nonNullable.group({
    gender:   ['' as ActorGender | ''],
    location: [''],
  });

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const initSearch   = qp.get('search') ?? '';
    const initPage     = Number(qp.get('page') ?? '1') || 1;
    const initGender   = (qp.get('gender') ?? '') as ActorGender | '';
    const initLocation = qp.get('location') ?? '';

    this.searchValue.set(initSearch);
    this.filters.patchValue({ gender: initGender, location: initLocation });
    this.load(initPage, initSearch, initGender, initLocation);

    this.searchSubject.pipe(
      debounceTime(450),
      distinctUntilChanged(),
      switchMap(q => {
        this.updateUrl(1, q);
        this.load(1, q);
        return of(null);
      }),
      takeUntilDestroyed(this.destroy),
    ).subscribe();
  }

  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.searchSubject.next(value);
  }

  clearSearch(): void {
    this.onSearchInput('');
  }

  applyFilters(): void {
    this.updateUrl(1, this.searchValue());
    this.load(1);
  }

  resetFilters(): void {
    this.filters.reset();
    this.updateUrl(1, this.searchValue());
    this.load(1);
  }

  load(page: number, search = this.searchValue(), gender = this.filters.controls.gender.value, location = this.filters.controls.location.value): void {
    this.loading.set(true);
    this.error.set(null);
    this.marketplace.getCastingCalls(page, search || undefined, gender || undefined, location || undefined).subscribe({
      next: (res) => {
        this.calls.set(res.results);
        this.page.set(res.page);
        this.totalPages.set(res.total_pages);
        this.total.set(res.total_results);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(marketplaceErrorMessage(err) ?? 'marketplace.errors.loadFailed');
      },
    });
  }

  changePage(page: number): void {
    this.updateUrl(page, this.searchValue());
    this.load(page);
  }

  private updateUrl(page: number, search: string): void {
    const f = this.filters.getRawValue();
    const queryParams: Record<string, string | number | null> = {};
    if (search)     queryParams['search']   = search;
    if (f.gender)   queryParams['gender']   = f.gender;
    if (f.location) queryParams['location'] = f.location;
    if (page > 1)   queryParams['page']     = page;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
