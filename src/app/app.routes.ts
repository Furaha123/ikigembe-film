import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/browse/browse.component').then(a => a.BrowseComponent) },
  { path: 'browse', loadComponent: () => import('./pages/browse/browse.component').then(a => a.BrowseComponent) },
  { path: 'movie/:id', loadComponent: () => import('./pages/movie-detail/movie-detail.component').then(a => a.MovieDetailComponent) }
];
