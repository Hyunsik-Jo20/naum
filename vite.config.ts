import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// data.go.kr(기상청·에어코리아)은 CORS 미허용 + 키 필요 →
// 개발 서버 프록시로 우회하고 serviceKey를 서버측에서 주입(브라우저 노출 방지).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.DATAGOKR_KEY ?? ''
  const withKey = (path: string) =>
    path + (path.includes('?') ? '&' : '?') + 'serviceKey=' + key

  return {
    plugins: [react()],
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
