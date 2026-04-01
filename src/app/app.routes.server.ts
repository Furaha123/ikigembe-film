import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'movie/:id',              renderMode: RenderMode.Server },
  { path: 'admin/dashboard',        renderMode: RenderMode.Server },
  { path: 'admin/users',            renderMode: RenderMode.Server },
  { path: 'admin/producers',        renderMode: RenderMode.Server },
  { path: 'admin/movies',           renderMode: RenderMode.Server },
  { path: 'admin/movies/create',    renderMode: RenderMode.Server },
  { path: 'admin/withdrawals',      renderMode: RenderMode.Server },
  { path: 'admin/settings',         renderMode: RenderMode.Server },
  { path: 'producer/dashboard',     renderMode: RenderMode.Server },
  { path: 'producer/movies',        renderMode: RenderMode.Server },
  { path: 'producer/wallet',        renderMode: RenderMode.Server },
  { path: 'producer/withdrawals',   renderMode: RenderMode.Server },
  { path: 'producer/settings',      renderMode: RenderMode.Server },
  { path: '**',              renderMode: RenderMode.Prerender },
];
  