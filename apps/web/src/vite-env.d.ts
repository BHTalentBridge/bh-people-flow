/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the API, baked in at build time.
   *
   * Unset in local development, where Vite proxies `/api` to the API on :4000
   * (see vite.config.ts). Set it when the frontend is served from a different
   * origin than the API — e.g. a Render static site talking to a Render web
   * service. Because Vite inlines it at build time, changing it needs a rebuild.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
