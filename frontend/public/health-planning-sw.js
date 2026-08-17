self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || { title: 'แจ้งเตือนสุขภาพ', body: 'มีรายการสุขภาพที่ต้องติดตาม' }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.svg', tag: data.tag || 'health-planning' }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/health-planning'))
})
