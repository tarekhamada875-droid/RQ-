/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_API_URL?: string;
  readonly VITE_RQ_USE_EMULATORS?: string;
  readonly VITE_RQ_EMULATOR_HOST?: string;
  readonly VITE_RQ_AUTH_EMULATOR_PORT?: string;
  readonly VITE_RQ_FIRESTORE_EMULATOR_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
