import { Routes } from '@angular/router';
import { producerGuard, readyProducerGuard } from './guards/producer.guard';
import { marketplaceGuard, marketplaceRoute } from '../core/access/marketplace.guard';
import { unsavedChangesGuard } from '../core/guards/unsaved-changes.guard';
import { ProducerLayoutComponent } from './layout/producer-layout.component';

export const producerRoutes: Routes = [
  {
    path: 'onboarding',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/onboarding/producer-onboarding.component').then(m => m.ProducerOnboardingComponent),
  },
  {
    path: '',
    component: ProducerLayoutComponent,
    canActivate: [producerGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/producer-dashboard.component').then(m => m.ProducerDashboardComponent),
      },
      {
        path: 'upload',
        canActivate: [readyProducerGuard],
        loadComponent: () => import('./pages/upload/producer-upload.component').then(m => m.ProducerUploadComponent),
      },
      {
        path: 'movies',
        loadComponent: () => import('./pages/movies/producer-movies.component').then(m => m.ProducerMoviesComponent),
      },
      {
        path: 'movies/:id',
        loadComponent: () => import('./pages/movies/movie-detail/producer-movie-detail.component').then(m => m.ProducerMovieDetailComponent),
      },
      {
        path: 'wallet',
        loadComponent: () => import('./pages/wallet/producer-wallet.component').then(m => m.ProducerWalletComponent),
      },
      {
        path: 'statements',
        loadComponent: () => import('./pages/statements/producer-statements.component').then(m => m.ProducerStatementsComponent),
      },
      {
        path: 'withdrawals',
        loadComponent: () => import('./pages/withdrawals/producer-withdrawals.component').then(m => m.ProducerWithdrawalsComponent),
      },
      {
        path: 'contracts',
        loadComponent: () => import('./pages/contracts/producer-contracts.component').then(m => m.ProducerContractsComponent),
      },
      {
        path: 'casting',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('my-casting-calls'),
        loadComponent: () => import('./pages/casting/producer-casting.component').then(m => m.ProducerCastingComponent),
      },
      {
        path: 'casting/new',
        canActivate: [marketplaceGuard],
        canDeactivate: [unsavedChangesGuard],
        data: marketplaceRoute('post-casting'),
        loadComponent: () => import('./pages/casting/casting-wizard/casting-wizard.component').then(m => m.CastingWizardComponent),
      },
      {
        path: 'casting/:id/edit',
        canActivate: [marketplaceGuard],
        canDeactivate: [unsavedChangesGuard],
        data: marketplaceRoute('post-casting'),
        loadComponent: () => import('./pages/casting/casting-wizard/casting-wizard.component').then(m => m.CastingWizardComponent),
      },
      {
        path: 'applications',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('casting-applications'),
        loadComponent: () => import('./pages/casting/casting-applications/casting-applications.component').then(m => m.CastingApplicationsComponent),
      },
      {
        path: 'access',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('my-access'),
        loadComponent: () => import('./pages/access/producer-access.component').then(m => m.ProducerAccessComponent),
      },
      {
        path: 'casting/:id',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('my-casting-calls'),
        loadComponent: () => import('./pages/casting/casting-applications/casting-applications.component').then(m => m.CastingApplicationsComponent),
      },
      {
        path: 'actors',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('find-actors', { tab: 'search' }),
        loadComponent: () => import('./pages/actors/actor-directory.component').then(m => m.ActorDirectoryComponent),
      },
      {
        path: 'shortlist',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('shortlist', { tab: 'shortlist' }),
        loadComponent: () => import('./pages/actors/actor-directory.component').then(m => m.ActorDirectoryComponent),
      },
      {
        path: 'actors/:id',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('find-actors'),
        loadComponent: () => import('./pages/actors/actor-detail/producer-actor-detail.component').then(m => m.ProducerActorDetailComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
        // Rendered inside the dashboard layout, so the page skips the site header.
        data: { embedded: true },
      },
    ],
  },
  // Contract signing flow — rendered without the sidebar layout
  {
    path: 'contracts/start',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/welcome/contract-welcome.component').then(m => m.ContractWelcomeComponent),
  },
  {
    path: 'contracts/language',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/language/contract-language.component').then(m => m.ContractLanguageComponent),
  },
  {
    path: 'contracts/review',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/review/contract-review.component').then(m => m.ContractReviewComponent),
  },
  {
    path: 'contracts/warning',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/warning/contract-warning.component').then(m => m.ContractWarningComponent),
  },
  {
    path: 'contracts/accept',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/acceptance/contract-acceptance.component').then(m => m.ContractAcceptanceComponent),
  },
  {
    path: 'contracts/verifying',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/verifying/contract-verification.component').then(m => m.ContractVerificationComponent),
  },
  {
    path: 'contracts/success',
    canActivate: [producerGuard],
    loadComponent: () => import('./pages/contracts/success/contract-success.component').then(m => m.ContractSuccessComponent),
  },
];
