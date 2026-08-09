self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "PGC Tour";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "There is a new update in the clubhouse.",
      icon: "/logo192.png",
      badge: "/logo192.png",
      tag: payload.tag || "pgc-update",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((tabs) => {
        for (const tab of tabs) {
          if ("focus" in tab) {
            if ("navigate" in tab) tab.navigate(destination);
            return tab.focus();
          }
        }
        return clients.openWindow ? clients.openWindow(destination) : undefined;
      }),
  );
});
