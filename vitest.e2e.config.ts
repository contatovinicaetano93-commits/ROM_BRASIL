import path from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes que batem em http://localhost:3000. Exigem `npm run dev` rodando.
// Não entram no `npm test` nem no CI — ver vitest.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './scripts/mock-server-only.cjs'),
    },
  },
})
