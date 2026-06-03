self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { body: event.data ? event.data.text() : "Nowe powiadomienie" };
  }

  const title = payload.title || "Family Cart";
  const options = {
    body: payload.body || "Masz nowe powiadomienie w Family Cart.",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    data: {
      url: payload.url || payload?.payload?.url || "/",
      payload,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const targetUrl = new URL(url, self.location.origin).href;
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
