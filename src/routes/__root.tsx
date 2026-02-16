import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanstackDevtools } from "@tanstack/react-devtools";
import { useEffect } from "react";

import { NavigationContainer } from "@/facilitators";

import "../styles.css";
import { Providers, SignedOutPersistentSignIn } from "@/components/displays";
import { PWAInstallPrompt } from "@/components/displays/PWAInstallPrompt";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "PGC Tour",
      },
      {
        name: "description",
        content: "Pure Golf Collective Fantasy Golf Tour",
      },
      {
        name: "mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-capable",
        content: "yes",
      },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "default",
      },
      {
        name: "mobile-web-app-title",
        content: "PGC Clubhouse",
      },
      {
        name: "apple-mobile-web-app-title",
        content: "PGC Clubhouse",
      },
      {
        name: "theme-color",
        content: "#059669",
      },
      {
        name: "google-site-verification",
        content: "k_L19BEXJjcWOM7cHFMPMpK9MBdcv2uQ6qFt3HGPEbc",
      },
      {
        name: "application-name",
        content: "PGC Tour",
      },
      {
        name: "msapplication-TileColor",
        content: "#059669",
      },
      {
        name: "msapplication-config",
        content: "/browserconfig.xml",
      },
    ],
    links: [
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "icon",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo192.png",
      },
      {
        rel: "apple-touch-startup-image",
        href: "/logo512.png",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Varela+Round&family=Yellowtail&family=Oswald:wght@200..700&display=swap",
      },
    ],
  }),

  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-8 text-center">
      <h1 className="mb-4 text-4xl font-bold">404 - Page Not Found</h1>
      <p className="mb-8 text-muted-foreground">
        The page you're looking for doesn't exist.
      </p>
      <a href="/" className="text-primary hover:underline">
        Go back home
      </a>
    </div>
  ),
});

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (import.meta.env.DEV) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (registrations.length === 0) return;

        Promise.all(registrations.map((r) => r.unregister())).then(() => {
          window.location.reload();
        });
      });

      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log(
          "ServiceWorker registration successful with scope: ",
          registration.scope,
        );
      })
      .catch((err) => {
        console.log("ServiceWorker registration failed: ", err);
      });
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Providers>
          <NavigationContainer />
          <main className="pb-20 pt-16 md:pb-4 md:pt-20">{children}</main>
          <PWAInstallPrompt />
          <SignedOutPersistentSignIn />
          {import.meta.env.DEV ? (
            <TanstackDevtools
              config={{
                position: "bottom-left",
              }}
            />
          ) : null}
        </Providers>
        <Scripts />
      </body>
    </html>
  );
}
