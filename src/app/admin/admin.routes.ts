import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
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
        loadComponent: () => import('./pages/marketplace/admin-marketplace.component').then(m => m.AdminMarketplaceComponent),
      },
      {
        path: 'reports',
        loadComponent: () => import('./pages/reports/admin-reports.component').then(m => m.AdminReportsComponent),
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
