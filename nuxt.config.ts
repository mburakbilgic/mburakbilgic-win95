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
    public: {
      resumePdfUrl: process.env.NUXT_PUBLIC_RESUME_PDF_URL || '',
      resumePreviewUrl: process.env.NUXT_PUBLIC_RESUME_PREVIEW_URL || '',
    },
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
})
