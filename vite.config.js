import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';



export default defineConfig({

  plugins: [react()],

  server: {

    proxy: {

      // Nickname for your backend

      '/api_backend': {

        target: 'http://localhost/PB2Link/backend/api',

        changeOrigin: true,

        rewrite: (path) => path.replace(/^\/api_backend/, ''),

      },

      '/uploads_backend': {
              target: 'http://localhost/PB2Link/backend/uploads',
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/uploads_backend/, ''),
            }

    },

  },

});