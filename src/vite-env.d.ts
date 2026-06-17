/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_WEATHER_SOURCE?: 'kma' | 'open-meteo'
  readonly VITE_KAKAO_JS_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
