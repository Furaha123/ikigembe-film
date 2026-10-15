import {
  Component, ElementRef, Injector, Input, afterNextRender, inject, signal, viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/services/auth.service';
import {
  ABUSE_CATEGORIES, AbuseCategory, AbuseReportService, AbuseTargetType,
} from '../../../core/services/abuse-report.service';
import { ModalBackdropDirective } from '../../directives/modal-backdrop.directive';
import { apiErrorMessage } from '../../utils/api-error';
import { RETURN_URL_PARAM } from '../../utils/safe-redirect';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Report" link + dialog for a film, casting call or actor. Signed-out visitors are sent to sign in.
 * Reporting never hides anything; an admin reviews every report.
 */
@Component({
  selector: 'app-report-button',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, ModalBackdropDirective],
  templateUrl: './report-button.component.html',
  styleUrl: './report-button.component.scss',
})
export class ReportButtonComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(AbuseReportService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly injector = inject(Injector);

  @Input({ required: true }) targetType!: AbuseTargetType;
  @Input({ required: true }) targetId!: number;
  /** Shown in the dialog title. */
  @Input() label = '';

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly doneBtn = viewChild<ElementRef<HTMLButtonElement>>('doneBtn');

  readonly categories = ABUSE_CATEGORIES;
  category: AbuseCategory | null = null;
  details = '';
  isOpen = signal(false);
  sending = signal(false);
  error = signal<string | null>(null);
  done = signal<'filed' | 'already' | null>(null);

  open(): void {
    this.isOpen.set(true);
    this.afterRender(() => this.card()?.nativeElement.focus());
  }

  /** Closing resets a finished report so the next one starts from a blank form; a draft is kept. */
  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    if (this.done()) {
      this.done.set(null);
      this.category = null;
      this.details = '';
    }
    this.error.set(null);
    this.trigger().nativeElement.focus();
  }

  /** Keeps Tab inside the dialog while it is open (aria-modal). */
  trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const items = Array.from(this.card()?.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
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
      next: (r) => {
        this.sending.set(false);
        this.done.set(r.already_reported ? 'already' : 'filed');
        this.afterRender(() => this.doneBtn()?.nativeElement.focus());
      },
      error: (err: unknown) => {
        this.sending.set(false);
        const status = (err as { status?: number })?.status;
        this.error.set(status === 429 ? this.translate.instant('abuse.tooMany')
          : (apiErrorMessage(err) ?? this.translate.instant('abuse.failed')));
      },
    });
  }

  /** Runs once the view has rendered the new state (browser only). */
  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }
}
