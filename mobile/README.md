# ROM Brasil — app nativo (Capacitor)

Shell iOS/Android que abre a intranet em produção:

**https://rom-club.vercel.app**

Bundle id: `com.rom.brasil`  
App name: **ROM Brasil**

Não usa static export do Next.js. Login, cookies (`rom_session`) e APIs ficam no host Vercel.

## Setup

```bash
cd mobile
npm install
npx cap sync
```

### Android (Linux/Mac)

```bash
npx cap add android   # só na 1ª vez, se a pasta android/ não existir
npx cap open android  # Android Studio → Run / Generate Signed Bundle
```

### iOS (somente Mac + Xcode)

```bash
npx cap add ios
npx cap open ios
# Signing Team + Archive → App Store Connect / TestFlight
```

## Contas / lojas

| Loja | Conta | Custo |
|------|--------|------|
| Google Play | Play Console | US$ 25 (uma vez) |
| Apple | Apple Developer Program | ~US$ 99/ano |

### Google Play (checklist)

1. Criar app “ROM Brasil” (livre, produtividade/negócios).
2. Íone listing: ícone 512×512, feature graphic 1024×500, 2+ screenshots.
3. Política de privacidade (URL HTTPS pública).
4. Data safety form (login, cookies, dados de negócio).
5. Content rating.
6. Assinar AAB (`bundleRelease`) e enviar para produção/internal testing.

### App Store (checklist)

1. App Store Connect → novo app, bundle `com.rom.brasil`.
2. Screenshots iPhone (e iPad se marcar).
3. Privacy policy URL + App Privacy labels.
4. TestFlight interno → Submit for Review.
5. Se a review pedir “mais que um site”: mencionar splash nativo, status bar, uso interno da equipe ROM e câmera/checks quando habilitados.

## Troca de URL (preview)

Em `capacitor.config.ts`, `server.url` pode apontar temporariamente para um preview Vercel. Depois: `npx cap sync`.

## Paridade

O shell do Iguatemi fica em `rom-iguatemi/mobile` (`com.rom.iguatemi` → `https://rom-iguatemi.vercel.app`).
