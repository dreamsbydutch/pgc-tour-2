# Styling and UI

Styling is Tailwind CSS with shadcn/ui-style primitives.

## Tailwind

- Global styles are in `src/styles.css`.
- Use Tailwind utility classes for layout and spacing.

## UI primitives

UI primitives live in `src/components/ui/*` and should stay free of app/business concerns.

## Class name composition

Use `cn()` from `src/lib/utils.ts` for className composition.

## Icons

Icons use `lucide-react`.

## PWA assets

- PWA manifest is served from `public/manifest.json`.
- The root shell registers a service worker in production.

See also:

- [../architecture/routing-and-rendering.md](../architecture/routing-and-rendering.md)
- [../deployment/vercel.md](../deployment/vercel.md)
