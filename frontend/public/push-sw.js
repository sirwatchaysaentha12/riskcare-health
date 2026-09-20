self.addEventListener('push', (event) => {
  const data = event.data?.json?.() || { title: 'แจ้งเตือนนัดหมาย', body: 'คุณมีนัดหมายใกล้ถึง' }
  event.waitUntil(self.registration.showNotification(data.title || 'แจ้งเตือนนัดหมาย', { body: data.body, icon: '/favicon.svg', data: { url: '/appointments' } }))
})
self.addEventListener('notificationclick', (event) => { event.notification.close(); event.waitUntil(self.clients.openWindow(event.notification.data?.url || '/appointments')) })
