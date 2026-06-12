import { Routes } from '@angular/router';
import { producerGuard } from './guards/producer.guard';
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
        path: 'withdrawals',
        loadComponent: () => import('./pages/withdrawals/producer-withdrawals.component').then(m => m.ProducerWithdrawalsComponent),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports/producer-reports.component').then(m => m.ProducerReportsComponent),
      },
      {
        path: 'contracts',
        loadComponent: () => import('./pages/contracts/producer-contracts.component').then(m => m.ProducerContractsComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
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
