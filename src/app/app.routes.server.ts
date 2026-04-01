import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'movie/:id',              renderMode: RenderMode.Server },
  { path: 'admin/**',               renderMode: RenderMode.Client },
  { path: 'producer/**',            renderMode: RenderMode.Client },
  { path: '**',                     renderMode: RenderMode.Prerender },
];
  