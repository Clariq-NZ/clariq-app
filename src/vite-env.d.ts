/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module '*.png' { const src: string; export default src }

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
