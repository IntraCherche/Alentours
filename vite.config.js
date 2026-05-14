import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Alentours',
        short_name: 'Alentours',
        description: 'Ambient road trip companion — map, route progress, nearby towns',
        theme_color: '#0f1923',
        background_color: '#0f1923',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache OpenStreetMap tiles for offline use
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
          {
            // Cache Wikipedia API responses
            urlPattern: /^https:\/\/[a-z]+\.wikipedia\.org\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'wikipedia-api' }
          }
        ]
      }
    })
  ],
  base: './'
})
