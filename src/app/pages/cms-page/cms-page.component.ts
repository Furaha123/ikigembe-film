import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';
import { CmsService } from '../../core/services/cms.service';
import { LanguageService } from '../../core/services/language.service';
import { SeoService } from '../../core/services/seo.service';
import { CmsPageBodyComponent } from '../../shared/components/cms-page-body/cms-page-body.component';
import { CmsPage } from '../../shared/models/cms.interface';
import { TermsComponent } from '../terms/terms.component';

type LoadResult = { page: CmsPage } | { missing: true };

/** Plain-text summary of HTML for the meta description (server + browser safe). */
export function summarize(html: string, max = 155): string {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Public CMS page (/terms, /about, /privacy, /contact, /pages/:slug).
 * Slug comes from route data or the :slug param; Kinyarwanda uses `<slug>-rw`.
 * If the API has no page (or is unreachable), the terms route falls back to the
 * built-in terms text so a legal page is never blank.
 */
@Component({
  selector: 'app-cms-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe, CmsPageBodyComponent, TermsComponent],
  templateUrl: './cms-page.component.html',
  styleUrls: ['./cms-page.component.scss'],
})
export class CmsPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly cms = inject(CmsService);
  private readonly seo = inject(SeoService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lang$ = toObservable(this.language.currentLang);

  slug    = signal('');
  page    = signal<CmsPage | null>(null);
  loading = signal(true);
  missing = signal(false);

  ngOnInit(): void {
    const slug$ = combineLatest([this.route.data, this.route.paramMap]).pipe(
      map(([data, params]) => (data['slug'] as string | undefined) ?? params.get('slug') ?? ''),
    );

    combineLatest([slug$, this.lang$]).pipe(
      switchMap(([slug, lang]) => {
        this.slug.set(slug);
        this.loading.set(true);
        return this.cms.getLocalizedPage(slug, lang).pipe(
          map((page): LoadResult => ({ page })),
          // 404, network error or server timeout → fallback content, never a blank page
          catchError((_err: HttpErrorResponse | Error) => of<LoadResult>({ missing: true })),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.loading.set(false);
      if ('page' in result) {
        this.page.set(result.page);
        this.missing.set(false);
        this.seo.set({ title: result.page.title, description: summarize(result.page.body) || result.page.title });
      } else {
        this.page.set(null);
        this.missing.set(true);
        if (this.slug() !== 'terms') {
          this.seo.setTranslated({ titleKey: 'cms.notFoundTitle', noIndex: true });
        }
      }
    });
  }
}
