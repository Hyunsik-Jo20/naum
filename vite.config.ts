import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// data.go.kr(기상청·에어코리아)은 CORS 미허용 + 키 필요 →
// 개발 서버 프록시로 우회하고 serviceKey를 서버측에서 주입(브라우저 노출 방지).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.DATAGOKR_KEY ?? ''
  const withKey = (path: string) =>
    path + (path.includes('?') ? '&' : '?') + 'serviceKey=' + key

  return {
    plugins: [
      react(),
      // PWA — 앱 셸을 서비스워커로 캐시해 설치형(APK처럼) + 오프라인 실행.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        manifest: {
          name: '나음 — 보건실 디지털 전환 플랫폼',
          short_name: '나음',
          description: '학생 셀프 접수·처치·알림. 오프라인에서도 동작하는 보건실 플랫폼.',
          lang: 'ko',
          theme_color: '#1d4ed8',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ttf}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              // Tabler 아이콘 폰트/CSS(CDN) — 첫 방문 후 오프라인에서도 아이콘 표시.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/,
              handler: 'CacheFirst',
              options: { cacheName: 'cdn-jsdelivr', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 } },
            },
          ],
        },
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          // 단일 540KB 번들을 독립 캐시·병렬 로드 가능한 청크로 분리.
          //  · vendor-react/supabase: 앱 배포마다 안 바뀜 → 재방문 시 캐시 적중.
          //  · data-busan: 642개교 명단·교육청 합성지표(무거움) → 앱 코어에서 떼내 병렬 로드.
          manualChunks(id) {
            if (/[\\/]node_modules[\\/]/.test(id)) {
              if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id))
                return 'vendor-react'
              if (id.includes('@supabase')) return 'vendor-supabase'
              return 'vendor'
            }
            if (/[\\/]data[\\/](busanSchools|eduMock|surveillance|monthly)\b/.test(id)) return 'data-busan'
            return undefined
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        // 로컬 스테이션(PII) · 중앙 서버(비식별) 백엔드 프록시. SSE 스트림 포함.
        // 백엔드(`npm run server`) 미가동 시 프론트는 자동으로 in-browser 폴백.
        '/station': { target: 'http://localhost:8787', changeOrigin: true },
        '/central': { target: 'http://localhost:8788', changeOrigin: true },
        '/api/kmawrn': {
          target: 'https://apis.data.go.kr/1360000/WthrWrnInfoService',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => withKey(p.replace(/^\/api\/kmawrn/, '')),
        },
        '/api/kmaeqk': {
          target: 'https://apis.data.go.kr/1360000/EqkInfoService',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => withKey(p.replace(/^\/api\/kmaeqk/, '')),
        },
        '/api/kma': {
          target: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => withKey(p.replace(/^\/api\/kma/, '')),
        },
        '/api/airstn': {
          target: 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => withKey(p.replace(/^\/api\/airstn/, '')),
        },
        '/api/air': {
          target: 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => withKey(p.replace(/^\/api\/air/, '')),
        },
      },
    },
  }
})
