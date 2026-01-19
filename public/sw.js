/* Minimal PWA service worker (no caching).
   Keeps the app installable without risking stale data issues. */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  return;
});
    const allCacheKeys = await cache.keys();
    const url = new URL(request.url);

    // Look for cached versions of the same path
    for (const cachedRequest of allCacheKeys) {
      const cachedUrl = new URL(cachedRequest.url);
      if (cachedUrl.pathname === url.pathname) {
        const response = await cache.match(cachedRequest);
        if (response) {
          console.log("[SW] Found similar cached page:", cachedRequest.url);
          return response;
        }
      }
    }

    // Still no cache found - let the app handle this instead of showing offline page
    console.log(
      "[SW] No cached version found, letting app handle:",
      request.url,
    );
    throw error;
  }
}

// Message handling for cache invalidation
self.addEventListener("message", (event) => {
  console.log("[SW] Message received:", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "FORCE_UPDATE") {
    console.log("[SW] Forcing cache update for pages");
    // Clear page cache to force fresh requests
    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
      cache.keys().then((requests) => {
        requests.forEach((request) => {
          const url = new URL(request.url);
          if (isPageRequest(url.pathname)) {
            console.log("[SW] Clearing cached page:", request.url);
            cache.delete(request);
          }
        });
      });
    });
  }
});

// Helper functions to determine request types
function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2")
  );
}

function isApiCall(pathname) {
  return pathname.startsWith("/api/") || pathname.startsWith("/trpc/");
}

function isLiveData(pathname) {
  return (
    pathname.includes("/tournament") ||
    pathname.includes("/leaderboard") ||
    pathname.includes("/live") ||
    pathname.includes("/scores")
  );
}

function isMedia(request) {
  return (
    request.destination === "image" ||
    request.destination === "video" ||
    request.destination === "audio"
  );
}

function isPageRequest(pathname) {
  // Don't cache API routes, static files, etc.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return false;
  }

  // Cache actual page routes
  return (
    pathname.startsWith("/standings") ||
    pathname.startsWith("/tournament") ||
    pathname === "/" ||
    pathname.startsWith("/player") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/rulebook") ||
    pathname.startsWith("/signin")
  );
}

// Offline fallback page
async function getOfflineFallback() {
  const cache = await caches.open(STATIC_CACHE_NAME);

  // Try to return cached homepage
  const cachedHome = await cache.match("/");
  if (cachedHome) {
    return cachedHome;
  }

  // Return a simple offline message
  return new Response(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <title>PGC Tour - Offline</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f3f4f6;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 400px;
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          }
          h1 { color: #374151; margin-bottom: 16px; }
          p { color: #6b7280; line-height: 1.5; }
          .icon { font-size: 48px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">⛳</div>
          <h1>You're Offline</h1>
          <p>PGC Tour is not available right now. Please check your internet connection and try again.</p>
          <p>Some previously viewed content may still be available.</p>
        </div>
      </body>
    </html>
  `,
    {
      headers: {
        "Content-Type": "text/html",
      },
    },
  );
}

// Background sync for when connectivity is restored
self.addEventListener("sync", (event) => {
  console.log("[SW] Background sync triggered:", event.tag);

  if (event.tag === "background-sync") {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  console.log("[SW] Performing background sync...");

  try {
    // Sync critical data when back online
    const cache = await caches.open(DYNAMIC_CACHE_NAME);

    // Pre-fetch important routes
    const importantRoutes = [
      "/api/tournament/current",
      "/api/standings",
      "/tournament",
      "/standings",
    ];

    for (const route of importantRoutes) {
      try {
        const response = await fetch(route);
        if (response.ok) {
          await cache.put(route, response);
          console.log("[SW] Background sync cached:", route);
        }
      } catch (error) {
        console.log("[SW] Background sync failed for:", route, error);
      }
    }
  } catch (error) {
    console.error("[SW] Background sync error:", error);
  }
}

// Push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push received:", event);

  const options = {
    body: "Tournament update available!",
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "View Tournament",
        icon: "/logo192.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/logo192.png",
      },
    ],
  };

  if (event.data) {
    const data = event.data.json();
    options.body = data.body || options.body;
    options.title = data.title || "PGC Tour";
  }

  event.waitUntil(self.registration.showNotification("PGC Tour", options));
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification click received:", event);

  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/tournament"));
  } else if (event.action === "close") {
    // Just close the notification
  } else {
    // Default action - open the app
    event.waitUntil(clients.openWindow("/"));
  }
});

console.log("[SW] Service Worker registered successfully");
