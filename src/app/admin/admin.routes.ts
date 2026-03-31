import { Routes } from '@angular/router';
import { adminGuard, adminGuestGuard } from './guards/admin.guard';
import { AdminLayoutComponent } from './layout/admin-layout.component';

export const adminRoutes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    canActivate: [adminGuestGuard],
    loadComponent: () => import('./pages/login/admin-login.component').then(m => m.AdminLoginComponent),
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
        path: 'withdrawals',
        loadComponent: () => import('./pages/withdrawals/admin-withdrawals.component').then(m => m.AdminWithdrawalsComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
      },
    ],
  },
];
