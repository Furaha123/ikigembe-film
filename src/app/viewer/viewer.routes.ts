import { Routes } from '@angular/router';
import { authGuard, viewerGuard } from '../core/guards/auth.guard';
import { ViewerLayoutComponent } from './layout/viewer-layout.component';

export const viewerRoutes: Routes = [
  {
    path: '',
    component: ViewerLayoutComponent,
    children: [
      {
        path: 'browse',
        canActivate: [authGuard, viewerGuard],
        loadComponent: () => import('../pages/browse/browse.component').then(m => m.BrowseComponent),
      },
      {
        path: 'movie/:id',
        canActivate: [authGuard, viewerGuard],
        loadComponent: () => import('../pages/movie-detail/movie-detail.component').then(m => m.MovieDetailComponent),
      },
      {
        path: 'profile',
        canActivate: [authGuard, viewerGuard],
        loadComponent: () => import('../pages/profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'my-list',
        canActivate: [authGuard, viewerGuard],
        loadComponent: () => import('../pages/my-list/my-list.component').then(m => m.MyListComponent),
      },
      {
        path: 'producers',
        loadComponent: () => import('../pages/producers-list/producers-list.component').then(m => m.ProducersListComponent),
      },
      {
        path: 'producers/:id',
        loadComponent: () => import('../pages/producer-profile/producer-profile.component').then(m => m.ProducerProfileComponent),
      },
    ],
  },
];
