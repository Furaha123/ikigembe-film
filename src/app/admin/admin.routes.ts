import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { marketplaceGuard, marketplaceRoute } from '../core/access/marketplace.guard';
import { AdminLayoutComponent } from './layout/admin-layout.component';

export const adminRoutes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/users/admin-users.component').then(m => m.AdminUsersComponent),
      },
      {
        path: 'payments',
        loadComponent: () => import('./pages/payments/admin-payments.component').then(m => m.AdminPaymentsComponent),
      },
      {
        path: 'film-requests',
        loadComponent: () => import('./pages/film-requests/admin-film-requests.component').then(m => m.AdminFilmRequestsComponent),
      },
      {
        path: 'transcodes',
        loadComponent: () => import('./pages/transcodes/admin-transcodes.component').then(m => m.AdminTranscodesComponent),
      },
      {
        path: 'platform-settings',
        loadComponent: () => import('./pages/platform-settings/admin-platform-settings.component').then(m => m.AdminPlatformSettingsComponent),
      },
      {
        path: 'finance',
        loadComponent: () => import('./pages/finance/admin-finance.component').then(m => m.AdminFinanceComponent),
      },
      {
        path: 'audit-log',
        loadComponent: () => import('./pages/audit-log/admin-audit-log.component').then(m => m.AdminAuditLogComponent),
      },
      {
        path: 'producers',
        loadComponent: () => import('./pages/producers/admin-producers.component').then(m => m.AdminProducersComponent),
      },
      {
        path: 'movies',
        loadComponent: () => import('./pages/movies/admin-movies.component').then(m => m.AdminMoviesComponent),
      },
      {
        path: 'movies/create',
        loadComponent: () => import('./pages/movie-form/admin-movie-form.component').then(m => m.AdminMovieFormComponent),
      },
      {
        path: 'movies/edit/:id',
        loadComponent: () => import('./pages/movie-form/admin-movie-form.component').then(m => m.AdminMovieFormComponent),
      },
      {
        path: 'withdrawals',
        loadComponent: () => import('./pages/withdrawals/admin-withdrawals.component').then(m => m.AdminWithdrawalsComponent),
      },
      {
        path: 'contracts',
        loadComponent: () => import('./pages/contracts/admin-contracts.component').then(m => m.AdminContractsComponent),
      },
      { path: 'cms', redirectTo: 'cms/pages', pathMatch: 'full' },
      {
        path: 'cms/pages',
        loadComponent: () => import('./pages/cms/admin-cms-pages.component').then(m => m.AdminCmsPagesComponent),
      },
      {
        path: 'cms/ads',
        loadComponent: () => import('./pages/cms/admin-cms-ads.component').then(m => m.AdminCmsAdsComponent),
      },
      {
        path: 'marketplace',
        canActivate: [marketplaceGuard],
        data: marketplaceRoute('moderation'),
        loadComponent: () => import('./pages/marketplace/admin-marketplace.component').then(m => m.AdminMarketplaceComponent),
      },
      {
        path: 'marketplace-settings',
        loadComponent: () => import('./pages/marketplace-settings/admin-marketplace-settings.component').then(m => m.AdminMarketplaceSettingsComponent),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports/admin-reports.component').then(m => m.AdminReportsComponent),
      },
      {
        path: 'abuse-reports',
        loadComponent: () => import('./pages/abuse-reports/admin-abuse-reports.component').then(m => m.AdminAbuseReportsComponent),
      },
      {
        path: 'reports/monthly',
        loadComponent: () => import('./pages/monthly-reports/admin-monthly-reports.component').then(m => m.AdminMonthlyReportsComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
        // Rendered inside the dashboard layout, so the page skips the site header.
        data: { embedded: true },
      },
    ],
  },
];
