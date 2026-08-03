import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // src/__tests__/ fala com um servidor em localhost:3000. Fora do gate
    // unitário: sem servidor esses testes ou quebram ou passam sem verificar
    // nada. Rode com `npm run test:e2e` com o `npm run dev` de pé.
    exclude: [...configDefaults.exclude, 'src/__tests__/**'],
    // Vários testes fazem `await import('@/lib/...')` dentro do próprio caso.
    // O custo de transformar o módulo entra no orçamento do teste, e 5s (padrão)
    // estoura em máquina carregada ou em runner de CI.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './scripts/mock-server-only.cjs'),
    },
  },
})
