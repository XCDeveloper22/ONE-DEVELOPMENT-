import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function spaStaticRoutesPlugin(): Plugin {
  const spaRoutes = [
    'feed',
    'marketplace',
    'messages',
    'chats',
    'inbox',
    'notifications',
    'files',
    'my-posts',
    'my_posts',
    'guidelines',
    'rules',
    'suggestions',
    'about',
    'terms',
    'admin',
    'support',
    'settings',
    'settings/account',
    'settings/support',
    'settings/about',
    'settings/terms',
    'settings/rules',
  ];

  return {
    name: 'one-msu-spa-static-routes',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexHtmlPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexHtmlPath)) return;

      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

      // 1. Write 404.html fallback for static hosts (Wasmer, GitHub Pages, Cloudflare, etc.)
      fs.writeFileSync(path.join(distDir, '404.html'), htmlContent, 'utf-8');

      // 2. Write _redirects for hosts that honor SPA redirect rules
      fs.writeFileSync(path.join(distDir, '_redirects'), '/* /index.html 200\n', 'utf-8');

      // 3. Pre-generate directory index.html and .html files for every SPA route so refreshing /marketplace returns 200 OK
      for (const route of spaRoutes) {
        const routeDir = path.join(distDir, route);
        fs.mkdirSync(routeDir, {recursive: true});
        fs.writeFileSync(path.join(routeDir, 'index.html'), htmlContent, 'utf-8');
        if (!route.includes('/')) {
          fs.writeFileSync(path.join(distDir, `${route}.html`), htmlContent, 'utf-8');
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), spaStaticRoutesPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
