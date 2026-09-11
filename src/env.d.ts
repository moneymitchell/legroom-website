/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Cal.com booking slug or full URL, e.g. "legroom/breakdown". */
  readonly PUBLIC_CAL_LINK?: string;
  /** Cloudflare Turnstile SITE key. Public by design; the secret lives in the Worker. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
