import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

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
    canActivate: [authGuard],
    loadComponent: () => import('./pages/browse/browse.component').then(a => a.BrowseComponent)
  },
  {
    path: 'movie/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/movie-detail/movie-detail.component').then(a => a.MovieDetailComponent)
  }
];
