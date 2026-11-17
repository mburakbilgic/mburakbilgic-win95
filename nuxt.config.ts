// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Nuxt 4 defaults srcDir to app/; this project keeps its sources at the root.
  srcDir: '.',
  compatibilityDate: '2026-11-17',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  modules: [
    '@pinia/nuxt',
  ],
  runtimeConfig: {
    dbPath: '',
    adminPasswordHash: '',
    mailSmtpHost: '',
    mailSmtpPort: '',
    mailSmtpUser: '',
    mailSmtpPass: '',
    mailTo: '',
    mailFormSecret: '',
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
})
