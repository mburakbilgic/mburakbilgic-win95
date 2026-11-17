// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
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
