import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'movie/:id',              renderMode: RenderMode.Client },
  { path: 'admin/**',               renderMode: RenderMode.Client },
  { path: 'producer/**',            renderMode: RenderMode.Client },
  // Arbitrary CMS slugs can't be enumerated at build time; the fixed ones
  // (/terms, /about, /privacy, /contact) are prerendered with their content.
  { path: 'pages/:slug',            renderMode: RenderMode.Client },
  { path: '**',                     renderMode: RenderMode.Prerender },
];
  