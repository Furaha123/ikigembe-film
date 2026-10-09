import { Routes } from '@angular/router';
import { authGuard, guestGuard, viewerGuard } from './core/guards/auth.guard';
import { marketplaceGuard, marketplaceRoute } from './core/access/marketplace.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  // Public home page (signed in or not).
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home.component').then(a => a.HomeComponent)
  },
  // Public catalog with search / filters / sort (state in the URL).
  {
    path: 'films',
    loadComponent: () => import('./pages/films/films.component').then(a => a.FilmsComponent)
  },
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
    // Public film page: trailer and details for everyone; buying or watching asks visitors to sign in.
    path: 'movie/:id',
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
  // ── Actors Casting entry (public: no requests; the chosen page handles sign-in) ──
  {
    path: 'actors-casting',
    loadComponent: () => import('./pages/actors-casting/actors-casting.component').then(a => a.ActorsCastingComponent)
  },
  // ── Actor marketplace (viewers with an actor profile). Access: core/access/marketplace-access.ts ──
  {
    path: 'actor',
    canActivate: [authGuard],
    canActivateChild: [marketplaceGuard],
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'profile',
        data: marketplaceRoute('actor-profile'),
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/actor/actor-profile/actor-profile.component').then(a => a.ActorProfileComponent)
      },
      {
        path: 'videos',
        data: marketplaceRoute('talent-videos'),
        loadComponent: () => import('./pages/actor/actor-videos/actor-videos.component').then(a => a.ActorVideosComponent)
      },
      {
        path: 'talent/new',
        data: marketplaceRoute('submit-talent'),
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./pages/actor/talent-submit/talent-submit.component').then(a => a.TalentSubmitComponent)
      },
      {
        path: 'applications',
        data: marketplaceRoute('my-applications'),
        loadComponent: () => import('./pages/actor/my-applications/my-applications.component').then(a => a.MyApplicationsComponent)
      },
    ]
  },
  {
    path: 'casting',
    canActivate: [authGuard, marketplaceGuard],
    data: marketplaceRoute('casting-calls'),
    loadComponent: () => import('./pages/casting/casting-calls/casting-calls.component').then(a => a.CastingCallsComponent)
  },
  {
    path: 'casting/:id',
    canActivate: [authGuard, marketplaceGuard],
    data: marketplaceRoute('casting-calls'),
    loadComponent: () => import('./pages/casting/casting-call-detail/casting-call-detail.component').then(a => a.CastingCallDetailComponent)
  },
  // ── CMS pages (content from /api/pages/<slug>/; built-in terms text as fallback) ──
  { path: 'terms',   data: { slug: 'terms' },   loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'about',   data: { slug: 'about' },   loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'privacy', data: { slug: 'privacy' }, loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'contact', data: { slug: 'contact' }, loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
  { path: 'refund-policy', data: { slug: 'refund-policy' }, loadComponent: () => import('./pages/cms-page/cms-page.component').then(a => a.CmsPageComponent) },
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
  },
  // ── Hosted-page payments (DPO): the buyer returns here; the demo checkout stands in for DPO ──
  {
    path: 'payment/return',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/payment/payment-return.component').then(a => a.PaymentReturnComponent)
  },
  {
    path: 'payment/demo-checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/payment/demo-checkout.component').then(a => a.DemoCheckoutComponent)
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(a => a.NotFoundComponent)
  }
];
