import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'movie/:id',       renderMode: RenderMode.Server },
  { path: 'admin/login',     renderMode: RenderMode.Server },
  { path: 'admin/dashboard', renderMode: RenderMode.Server },
  { path: 'admin/users',     renderMode: RenderMode.Server },
  { path: 'admin/producers', renderMode: RenderMode.Server },
  { path: 'admin/movies',    renderMode: RenderMode.Server },
  { path: '**',              renderMode: RenderMode.Prerender },
];
