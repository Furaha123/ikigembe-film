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
    path: 'register/producer',
    redirectTo: '/register?role=producer',
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/forgot-password/forgot-password.component').then(a => a.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password/reset-password.component').then(a => a.ResetPasswordComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./pages/verify-email/verify-email.component').then(a => a.VerifyEmailComponent)
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
  // ── Actor marketplace (viewers with an actor profile) ──
  {
    path: 'actor',
    canActivate: [authGuard, viewerGuard],
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'profile',
        loadComponent: () => import('./pages/actor/actor-profile/actor-profile.component').then(a => a.ActorProfileComponent)
      },
      {
        path: 'videos',
        loadComponent: () => import('./pages/actor/actor-videos/actor-videos.component').then(a => a.ActorVideosComponent)
      },
      {
        path: 'applications',
        loadComponent: () => import('./pages/actor/my-applications/my-applications.component').then(a => a.MyApplicationsComponent)
      },
    ]
  },
  {
    path: 'casting',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/casting/casting-calls/casting-calls.component').then(a => a.CastingCallsComponent)
  },
  {
    path: 'casting/:id',
    canActivate: [authGuard, viewerGuard],
    loadComponent: () => import('./pages/casting/casting-call-detail/casting-call-detail.component').then(a => a.CastingCallDetailComponent)
  },
  // ── CMS pages (content from /api/pages/<slug>/; built-in terms text as fallback) ──
  { path: 'terms',   data: { slug: 'terms' },   loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'about',   data: { slug: 'about' },   loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'privacy', data: { slug: 'privacy' }, loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'contact', data: { slug: 'contact' }, loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'pages/:slug', loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  {
    path: 'preview/:id',
    loadComponent: () => import('./pages/preview/preview.component').then(a => a.PreviewComponent)
  },
  {
    path: 'producers',
    loadComponent: () => import('./pages/producers-list/producers-list.component').then(a => a.ProducersListComponent)
  },
  {
    path: 'producers/:id',
    loadComponent: () => import('./pages/producer-profile/producer-profile.component').then(a => a.ProducerProfileComponent)
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
