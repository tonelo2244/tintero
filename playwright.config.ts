import { defineConfig } from '@playwright/test'

/**
 * Pruebas de extremo a extremo: arrancan la app de verdad (out/, así que antes `npm run build`)
 * y la manejan como lo haría una persona. Son pocas y de caminos críticos; la lógica fina
 * ya la cubren los tests unitarios de Vitest.
 */
export default defineConfig({
  testDir: 'e2e',
  // `npm run capturas` ejecuta e2e/readme.capture.ts, que regenera las imágenes del README.
  testMatch: process.env.CAPTURAS ? '**/*.capture.ts' : '**/*.spec.ts',
  // Cada prueba arranca su propio Electron; en paralelo se pisarían en los runners pequeños de CI.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // En CI, un reintento separa un fallo real de uno puntual (el informe marca la prueba como "flaky").
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results'
})
