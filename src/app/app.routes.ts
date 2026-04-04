import { Routes } from '@angular/router';
import { authGuard, guestGuard, viewerGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(a => a.LoginComponent)
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.component').then(a => a.RegisterComponent)
  },
  {
    path: 'browse',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/browse/browse.component').then(a => a.BrowseComponent)
  },
  {
    path: 'movie/:id',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/movie-detail/movie-detail.component').then(a => a.MovieDetailComponent)
  },
  {
    path: 'profile',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/profile/profile.component').then(a => a.ProfileComponent)
  },
  {
    path: 'my-list',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/my-list/my-list.component').then(a => a.MyListComponent)
  },
  {
    path: 'producer',
    loadChildren: () => import('./producer/producer.routes').then(m => m.producerRoutes),
  },
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then(m => m.adminRoutes),
  }
];
