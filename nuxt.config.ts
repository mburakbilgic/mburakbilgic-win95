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
    public: {
      resumePdfUrl: process.env.NUXT_PUBLIC_RESUME_PDF_URL || '',
      resumePreviewUrl: process.env.NUXT_PUBLIC_RESUME_PREVIEW_URL || '',
      mailFormAction: process.env.NUXT_PUBLIC_MAIL_FORM_ACTION || '',
      mailEntrySubject: process.env.NUXT_PUBLIC_MAIL_ENTRY_SUBJECT || '',
      mailEntrySender: process.env.NUXT_PUBLIC_MAIL_ENTRY_SENDER || '',
      mailEntryContent: process.env.NUXT_PUBLIC_MAIL_ENTRY_CONTENT || '',
      photoUrls,
    },
  },
  vite: {
    build: {
      cssCodeSplit: false,
    },
  },
})
