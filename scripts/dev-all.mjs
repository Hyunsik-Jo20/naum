// 백엔드(중앙+스테이션) + Vite 개발 서버를 한 번에 기동. (의존성 없음)
//   npm run dev:all
import { spawn } from 'node:child_process'

const opts = { stdio: 'inherit', shell: true }
const procs = [spawn('npm', ['run', 'server'], opts), spawn('npm', ['run', 'dev'], opts)]

const kill = () => procs.forEach((p) => p.kill())
process.on('SIGINT', kill)
process.on('SIGTERM', kill)
