# Shoply Mobile Client Agent Guide

This directory is the Shoply mobile client Turbo workspace root. The Expo app lives in `apps/mobile`.

Before touching code:

1. Read `/Users/seongyong/Desktop/shoply/docs/shoply-mobile-review-commerce-ui-guide.md`.
2. Read `/Users/seongyong/Desktop/shoply/docs/shoply-mobile-client-stack-fsd.md`.
3. Use the local skills in `~/.codex/skills`: `building-native-ui`, `expo-dev-client`, `native-data-fetching`, `expo-cicd-workflows`, `expo-deployment`, `upgrading-expo`, `expo-observe`, `shoply-mobile-client-architecture`, `shoply-mobile-fsd-guardrails`, `shoply-mobile-quality`, `shoply-client-security`, `shoply-korean-commerce-compliance`, and `shoply-mobile-motion-interactions`.
4. Check Expo SDK 57 docs before changing Expo/Router/native config: https://docs.expo.dev/versions/v57.0.0/

Architecture rules:

- Treat this folder as a pnpm/Turbo workspace root.
- Expo Router files under `apps/mobile/app/` should compose page exports only.
- App code uses FSD under `apps/mobile/src/`: `app`, `pages`, `widgets`, `features`, `entities`, `shared`.
- Shared mobile design-system code belongs in `packages/design-system`.
- Shared config belongs in `packages/config`.
- Generated OpenAPI clients belong in `apps/mobile/src/shared/api/generated`.

Product rules:

- UI/UX comes before temporary server response shape. Do not weaken the design because an endpoint is incomplete.
- Light mode defaults to white surfaces and the Shoply primary token; dark mode follows phone settings.
- Token order is primitive -> semantic -> component -> theme.
- Home uses a 2-column media-first review grid. Search review/media results use a 3-column grid. Review detail is full-bleed media, not a small card.
- Only real OAuth login surfaces should be implemented in the client.
- Motion matters: use Reanimated/haptics for press feedback, icon toggles, sticker reveal, smooth feed interactions, and infinite scrolling.

Commands:

```bash
pnpm install
pnpm generate:api
pnpm typecheck
pnpm lint
npx expo-doctor@latest
npx eas-cli@latest init --id 83466a33-b79d-4ded-aa8e-dda1c2c91e64
npx eas-cli@latest build --profile production
```
