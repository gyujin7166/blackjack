import { defineConfig, devices } from '@playwright/test';

const clientUrl = 'http://127.0.0.1:5174';
const serverUrl = 'http://127.0.0.1:3101';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: clientUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter server exec tsx src/index.ts',
      env: {
        PORT: '3101',
        CLIENT_ORIGIN: clientUrl,
      },
      url: `${serverUrl}/socket.io/?EIO=4&transport=polling`,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter client exec vite --host 127.0.0.1 --port 5174 --strictPort',
      env: {
        VITE_SOCKET_URL: serverUrl,
      },
      url: clientUrl,
      timeout: 30_000,
    },
  ],
});
