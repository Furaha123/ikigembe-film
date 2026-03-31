import { Routes } from '@angular/router';
import { producerGuard } from './guards/producer.guard';
import { ProducerLayoutComponent } from './layout/producer-layout.component';

export const producerRoutes: Routes = [
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
        path: 'movies',
        loadComponent: () => import('./pages/movies/producer-movies.component').then(m => m.ProducerMoviesComponent),
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
        path: 'settings',
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
      },
    ],
  },
];
