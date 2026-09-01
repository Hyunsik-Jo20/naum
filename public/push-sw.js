// Web Push 수신 핸들러 — vite-plugin-pwa(generateSW)의 importScripts로 서비스워커에 포함됨.
//  접수 도착 시 서버(/api/push notify)가 보낸 페이로드를 OS 알림으로 표시하고,
//  대기 인원 수를 앱 아이콘 배지에도 반영한다(지원 플랫폼 한정). 내용은 비식별(개수만).
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { /* 텍스트/빈 페이로드 */ }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(d.title || '나음 보건실', {
        body: d.body || '새 접수가 도착했어요.',
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag: 'naum-visit', // 연속 접수는 최신 1개로 합침
        renotify: true,
        data: { url: d.url || '/nurse/queue' },
      })
      if (typeof d.count === 'number' && 'setAppBadge' in self.navigator) {
        try { await self.navigator.setAppBadge(d.count) } catch { /* ignore */ }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/nurse/queue'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if (c.navigate) c.navigate(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
