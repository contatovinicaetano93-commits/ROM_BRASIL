import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Shell nativo: carrega a intranet BR em produção (Next.js na Vercel).
 * Não usa static export — login, APIs e cookies ficam no host remoto.
 */
const config: CapacitorConfig = {
  appId: 'com.rom.brasil',
  appName: 'ROM Brasil',
  webDir: 'www',
  server: {
    url: 'https://rom-club.vercel.app',
    cleartext: false,
    allowNavigation: [
      'rom-club.vercel.app',
      '*.vercel.app',
      'rom-brasil-contatovinicaetano93-7290s-projects.vercel.app',
    ],
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0f172a',
  },
  ios: {
    backgroundColor: '#0f172a',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
}

export default config
