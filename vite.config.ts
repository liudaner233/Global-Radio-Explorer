import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { createAudioGateway } from './server/audioGateway.mjs';
import { startAudioService, stopAudioService } from './scripts/audioService.mjs';

function audioGatewayPlugin() {
  const configure = (server: {
    middlewares: { use: (middleware: ReturnType<typeof createAudioGateway>) => void };
    httpServer: { once: (event: string, callback: () => void) => void } | null;
  }) => {
    server.middlewares.use(createAudioGateway());
    void startAudioService();
    server.httpServer?.once('close', stopAudioService);
  };
  return {
    name: 'radio-audio-gateway',
    configureServer: configure,
    configurePreviewServer: configure,
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), 'AUDIO_'));
  return {
    plugins: [react(), tailwindcss(), audioGatewayPlugin()],
    build: {
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            if (id.includes('/node_modules/three/')) return 'globe-three';
            if (id.includes('/node_modules/tz-lookup/')) return 'globe-timezones';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: { ignored: ['**/audio-service/**'] },
      fs: {
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/audio-service/**'],
      },
    },
  };
});
