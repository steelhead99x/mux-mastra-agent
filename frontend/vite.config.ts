import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from root directory
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    // Expose VITE_ prefixed variables from root .env
    define: {
      'import.meta.env.VITE_MASTRA_API_HOST': JSON.stringify(env.VITE_MASTRA_API_HOST),
      'import.meta.env.VITE_BACKEND_PORT': JSON.stringify(env.BACKEND_PORT || '3001'),
      'import.meta.env.VITE_MUX_ANALYTICS_AGENT_ID': JSON.stringify(env.VITE_MUX_ANALYTICS_AGENT_ID),
      'import.meta.env.VITE_WEATHER_AGENT_ID': JSON.stringify(env.VITE_WEATHER_AGENT_ID),
      'import.meta.env.VITE_MUX_ASSET_ID': JSON.stringify(env.VITE_MUX_ASSET_ID),
      'import.meta.env.VITE_MUX_DEFAULT_ASSET_ID': JSON.stringify(env.VITE_MUX_DEFAULT_ASSET_ID),
      'import.meta.env.VITE_MUX_KEY_SERVER_URL': JSON.stringify(env.VITE_MUX_KEY_SERVER_URL),
    },
    server: {
      port: parseInt(env.FRONTEND_PORT || '3000'),
      strictPort: true, // Fail if port is not available
      proxy: {
        '/api': {
          target: `http://localhost:${env.BACKEND_PORT || '3001'}`,
          changeOrigin: true,
          timeout: 30000, // Increase timeout to prevent proxy errors
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            mux: ['@mux/mux-player-react'],
            mastra: ['@mastra/client-js'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  }
})
