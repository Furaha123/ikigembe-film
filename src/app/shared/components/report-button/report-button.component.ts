import { Component, ElementRef, Input, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import {
  ABUSE_CATEGORIES, AbuseCategory, AbuseReportService, AbuseTargetType,
} from '../../../core/services/abuse-report.service';
import { apiErrorMessage } from '../../utils/api-error';
import { RETURN_URL_PARAM } from '../../utils/safe-redirect';

/**
 * "Report" link + dialog for a film, casting call or actor. Signed-out visitors are sent to sign in.
 * Reporting never hides anything; an admin reviews every report.
 */
@Component({
  selector: 'app-report-button',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <button type="button" class="report-link" (click)="open()" aria-haspopup="dialog">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
      </svg>
      {{ 'abuse.button' | translate }}
    </button>

    <dialog #dialog class="report-dialog" aria-labelledby="report-title" (close)="onClosed()">
      <h2 id="report-title">{{ 'abuse.title' | translate: { name: label } }}</h2>
      @if (!auth.isLoggedIn()) {
        <p>{{ 'abuse.signInFirst' | translate }}</p>
        <div class="actions">
          <button type="button" class="btn ghost" (click)="close()">{{ 'abuse.cancel' | translate }}</button>
          <a class="btn" routerLink="/login" [queryParams]="loginParams()" (click)="close()">{{ 'abuse.signIn' | translate }}</a>
        </div>
      } @else if (done()) {
        <p role="status">{{ (done() === 'already' ? 'abuse.already' : 'abuse.thanks') | translate }}</p>
        <div class="actions">
          <button type="button" class="btn" (click)="close()">{{ 'abuse.close' | translate }}</button>
        </div>
      } @else {
        <form (ngSubmit)="submit()">
          <fieldset>
            <legend>{{ 'abuse.reason' | translate }}</legend>
            @for (c of categories; track c) {
              <label class="choice">
                <input type="radio" name="category" [value]="c" [(ngModel)]="category" required />
                {{ 'abuse.category.' + c | translate }}
              </label>
            }
          </fieldset>
          <label class="field">
            <span>{{ 'abuse.details' | translate }}</span>
            <textarea name="details" rows="3" maxlength="1000" [(ngModel)]="details"></textarea>
          </label>
          <p class="hint">{{ 'abuse.reviewNote' | translate }}</p>
          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <div class="actions">
            <button type="button" class="btn ghost" (click)="close()">{{ 'abuse.cancel' | translate }}</button>
            <button type="submit" class="btn" [disabled]="!category || sending()" [attr.aria-busy]="sending()">
              {{ (sending() ? 'abuse.sending' : 'abuse.send') | translate }}
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: [`
    :host { display: inline-flex; }
    .report-link {
      display: inline-flex; align-items: center; gap: .35rem; background: none; border: none; padding: .4rem 0;
      color: #9a9a9a; font-size: .82rem; cursor: pointer; text-decoration: underline; text-underline-offset: 3px;
    }
    .report-link:hover { color: #ddd; }
    .report-link:focus-visible, .btn:focus-visible, input:focus-visible, textarea:focus-visible {
      outline: 2px solid #c9a84c; outline-offset: 2px;
    }
    .report-dialog {
      width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
      background: #1a1a1a; color: #eee; border: 1px solid #333; border-radius: 12px; padding: 1.25rem;
    }
    .report-dialog::backdrop { background: rgba(0, 0, 0, .7); }
    h2 { font-size: 1.05rem; margin: 0 0 .9rem; }
    fieldset { border: none; padding: 0; margin: 0 0 .9rem; display: grid; gap: .45rem; }
    legend { font-weight: 600; margin-bottom: .5rem; font-size: .9rem; }
    .choice { display: flex; gap: .55rem; align-items: center; font-size: .9rem; cursor: pointer; }
    .field { display: grid; gap: .35rem; font-size: .88rem; }
    textarea {
      width: 100%; box-sizing: border-box; background: #111; color: #eee; border: 1px solid #444; border-radius: 8px;
      padding: .55rem; font: inherit; resize: vertical;
    }
    .hint { color: #9a9a9a; font-size: .8rem; margin: .6rem 0 0; }
    .error { color: #ff6b6b; font-size: .85rem; }
    .actions { display: flex; gap: .6rem; justify-content: flex-end; margin-top: 1rem; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; padding: .55rem 1rem; border-radius: 8px; border: 1.5px solid #c9a84c;
      background: #c9a84c; color: #111; font-weight: 600; font-size: .88rem; cursor: pointer; text-decoration: none;
    }
    .btn.ghost { background: transparent; color: #ddd; border-color: #555; }
    .btn:disabled { opacity: .55; cursor: not-allowed; }
  `],
})
export class ReportButtonComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(AbuseReportService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  @Input({ required: true }) targetType!: AbuseTargetType;
  @Input({ required: true }) targetId!: number;
  /** Shown in the dialog title. */
  @Input() label = '';

  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;

  readonly categories = ABUSE_CATEGORIES;
  category: AbuseCategory | null = null;
  details = '';
  sending = signal(false);
  error = signal<string | null>(null);
  done = signal<'filed' | 'already' | null>(null);

  open(): void {
    const el = this.dialog.nativeElement;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
  }

  close(): void {
    const el = this.dialog.nativeElement;
    if (typeof el.close === 'function') el.close();
    else el.removeAttribute('open');
    this.onClosed();
  }

  onClosed(): void {
    if (this.done()) {
      this.done.set(null);
      this.category = null;
      this.details = '';
    }
    this.error.set(null);
  }

  loginParams(): Record<string, string> {
    return { [RETURN_URL_PARAM]: this.router.url };
  }

  submit(): void {
    if (!this.category || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.api.report({ target_type: this.targetType, target_id: this.targetId, category: this.category,
                      details: this.details.trim() }).subscribe({
      next: (r) => { this.sending.set(false); this.done.set(r.already_reported ? 'already' : 'filed'); },
      error: (err: unknown) => {
        this.sending.set(false);
        const status = (err as { status?: number })?.status;
        this.error.set(status === 429 ? this.translate.instant('abuse.tooMany')
          : (apiErrorMessage(err) ?? this.translate.instant('abuse.failed')));
      },
    });
  }
}
