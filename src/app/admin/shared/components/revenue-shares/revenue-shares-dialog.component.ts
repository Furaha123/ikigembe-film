import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators,
} from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { startWith } from 'rxjs';
import { AdminService } from '../../../services/admin.service';
import { FilmRevenueShare, FilmRevenueShareList, FilmRevenueSharePayload, RevenueParty } from '../../../models/admin.interface';
import { apiErrorMessage } from '../../../../shared/utils/api-error';

type PartyGroup = FormGroup<{ name: FormControl<string>; percentage: FormControl<number | null> }>;

/** Sum of producer + platform + other-party percentages. */
export function splitTotal(producer: number | null, platform: number | null, parties: { percentage: number | null }[]): number {
  return (producer ?? 0) + (platform ?? 0) + parties.reduce((s, p) => s + (p.percentage ?? 0), 0);
}

/** Form-level validator mirroring the backend: the split must add up to exactly 100. */
export function totalIs100(group: AbstractControl): ValidationErrors | null {
  const v = group.value as { producer_percentage: number | null; platform_percentage: number | null; other_parties: { percentage: number | null }[] };
  const total = splitTotal(v.producer_percentage, v.platform_percentage, v.other_parties ?? []);
  return total === 100 ? null : { total: { actual: total } };
}

/**
 * Per-film revenue split history + "record a new split" form (admin).
 * Shares are append-only: there is no edit or delete, and a new share only
 * affects payments made after its effective date.
 */
@Component({
  selector: 'app-revenue-shares-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './revenue-shares-dialog.component.html',
  styleUrls: ['../../../pages/movies/admin-movies.component.scss', './revenue-shares-dialog.component.scss'],
})
export class RevenueSharesDialogComponent implements OnInit {
  @Input({ required: true }) movieId!: number;
  @Input() movieTitle = '';
  @Output() closed = new EventEmitter<void>();

  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);

  data      = signal<FilmRevenueShareList | null>(null);
  loading   = signal(true);
  loadError = signal<string | null>(null);
  saving    = signal(false);
  saveError = signal<string | null>(null);
  saved     = signal(false);

  form = this.fb.group({
    producer_percentage: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(100)]),
    platform_percentage: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(100)]),
    other_parties: this.fb.array<PartyGroup>([]),
    effective_from: this.fb.nonNullable.control(''),
    contract_id: this.fb.control<number | null>(null),
    notes: this.fb.nonNullable.control(''),
  }, { validators: totalIs100 });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.value)));

  total = computed(() => {
    const v = this.formValue();
    return splitTotal(v?.producer_percentage ?? null, v?.platform_percentage ?? null,
      (v?.other_parties ?? []).map(p => ({ percentage: p.percentage ?? null })));
  });

  /** Newest first for the timeline. */
  timeline = computed(() => [...(this.data()?.shares ?? [])].reverse());

  get parties(): FormArray<PartyGroup> {
    return this.form.controls.other_parties;
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.admin.getRevenueShares(this.movieId).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        if (this.form.pristine) {
          const base = d.current;
          this.form.patchValue({
            producer_percentage: base?.producer_percentage ?? d.default_producer_percentage,
            platform_percentage: base?.platform_percentage ?? 100 - d.default_producer_percentage,
          });
        }
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(apiErrorMessage(err) ?? 'admin.revenue.loadFailed');
      },
    });
  }

  addParty(): void {
    this.parties.push(this.fb.group({
      name: this.fb.nonNullable.control('', Validators.required),
      percentage: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(100)]),
    }));
  }

  removeParty(i: number): void {
    this.parties.removeAt(i);
  }

  isCurrent(s: FilmRevenueShare): boolean {
    return this.data()?.current?.id === s.id;
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const payload: FilmRevenueSharePayload = {
      producer_percentage: v.producer_percentage!,
      platform_percentage: v.platform_percentage!,
    };
    const parties: RevenueParty[] = v.other_parties.map(p => ({ name: p.name.trim(), percentage: p.percentage! }));
    if (parties.length) payload.other_parties = parties;
    if (v.effective_from) payload.effective_from = new Date(v.effective_from).toISOString();
    if (v.contract_id) payload.contract_id = v.contract_id;
    if (v.notes.trim()) payload.notes = v.notes.trim();

    this.saving.set(true);
    this.saveError.set(null);
    this.saved.set(false);
    this.admin.createRevenueShare(this.movieId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.parties.clear();
        this.form.patchValue({ effective_from: '', contract_id: null, notes: '' });
        this.form.markAsPristine();
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const body = err.error as Record<string, unknown> | null;
        const fieldMsg = body && typeof body === 'object'
          ? Object.values(body).find(Array.isArray) as string[] | undefined
          : undefined;
        this.saveError.set(apiErrorMessage(err) ?? fieldMsg?.[0] ?? 'admin.revenue.saveFailed');
      },
    });
  }
}
