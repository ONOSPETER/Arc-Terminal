import { defineConfig, mergeConfig } from 'vite';
import applicationConfig from './vite.config.js';

const port = Number(process.env.PORT || 5173);
const base = process.env.BASE_PATH || '/';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

export default defineConfig(async (configEnv) => {
  const inherited =
    typeof applicationConfig === 'function'
      ? await applicationConfig(configEnv)
      : applicationConfig;

  return mergeConfig(inherited, {
    base,
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      allowedHosts: true,
    },
    preview: {
      host: '0.0.0.0',
      port,
      allowedHosts: true,
    },
  });
});
