/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_API_URL?: string;
  readonly VITE_V2_READ_PACKAGE_CATALOG?: string;
  readonly VITE_V2_READ_GARAGE_SUMMARY?: string;
  readonly VITE_V2_READ_PENDING_QUEUE?: string;
  readonly VITE_V2_READ_RECENT_ACTIVITY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
