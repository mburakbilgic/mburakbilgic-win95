// https://nuxt.com/docs/api/configuration/nuxt-config
import photosContent from './content/photos.json'

const photoEnvKeys = photosContent.folders
  .flatMap((f) => f.content.map((i) => i.srcEnv))
  .filter(Boolean)

const photoUrls = Object.fromEntries(
  photoEnvKeys.map((k) => [k, process.env[k] || '']),
)

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
    mailSmtpHost: '',
    mailSmtpPort: '',
    mailSmtpUser: '',
    mailSmtpPass: '',
    mailTo: '',
    public: {
      resumePdfUrl: process.env.NUXT_PUBLIC_RESUME_PDF_URL || '',
      resumePreviewUrl: process.env.NUXT_PUBLIC_RESUME_PREVIEW_URL || '',
      photoUrls,
    },
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
})
