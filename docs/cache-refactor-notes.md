# Dog Coach UI/cache refactor notes

This branch starts the UI/cache cleanup.

## Done

- Replaced the service worker cache-first strategy for the app shell with network-first/no-store behavior.
- Clears old service worker caches on activate.
- Keeps runtime caching only for non-hot assets.
- Updated Vercel headers to avoid caching HTML, CSS, JS, JSON, manifest, and service worker files.

## Why

The app is a PWA and Safari/iOS can keep old CSS/JS aggressively. The previous setup cached `/styles.css`, `/js/*`, `/content/*`, and the service worker cached static assets cache-first. That made UI fixes look like they were not deployed.

## Next steps

- Split Academy and Chat renderers so AI logic lives only in the chat module.
- Keep tab visibility strict with hidden/aria-hidden/inert/display-none.
- Continue improving Profile, Academy, and Chat UI in separate commits.
