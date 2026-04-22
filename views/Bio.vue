<script setup>
import { useContent } from '@/composables/useContent'

const { site, bio } = useContent()
const currentAge = new Date().getFullYear() - site.birthYear
const aboutIntro = (bio.aboutIntroTemplate || '').replace('{age}', String(currentAge))
</script>

<template>
  <div>
    <img v-if="site.avatarPath" class="w-full h-auto" :src="site.avatarPath" :alt="site.name" />
    <h2 class="font-bold text-2xl py-5">{{ site.name }}</h2>
    <h4 class="text-gray-600 font-medium text-xs" style="padding-bottom: 10px">
      {{ site.headline }}
    </h4>
    <h4 class="text-gray-600 font-medium text-xs">{{ site.location }}</h4>

    <div class="flex flex-wrap mt-5 gap-2 items-center">
      <img
        v-for="badge in bio.techBadges"
        :key="badge.alt"
        class="w-auto h-5 rounded-none text-xs"
        :alt="badge.alt"
        :src="badge.src"
      />
    </div>

    <div class="pt-7">
      <h3 class="underline font-bold text-md pb-1">About Me</h3>
      <p v-if="aboutIntro" class="font-thin text-sm pb-2.5">
        {{ aboutIntro }}
      </p>
      <p
        v-for="paragraph in bio.aboutParagraphs"
        :key="paragraph.id"
        class="font-thin text-sm pb-2.5"
      >
        {{ paragraph.text }}
      </p>
    </div>

    <div class="pt-7">
      <h3 class="underline font-bold text-md pb-1">Employment History</h3>
    </div>
    <div
      v-for="job in bio.employment"
      :key="job.company + job.period"
      class="pt-7"
    >
      <h3 class="pb-1"><b>{{ job.company }} ({{ job.period }})</b></h3>
      <h6 class="text-gray-600 font-medium text-xs">{{ job.role }}</h6>
      <p class="font-thin text-sm pb-2.5" style="white-space: pre-line">{{ job.description }}</p>
    </div>

    <div class="pt-7">
      <h3 class="pb-1"><b>Résumé</b></h3>
      <a
        style="color: #ff5733"
        :href="bio.resumeLocalPath"
        class="font-thin text-sm pb-2.5"
      >{{ bio.resumeLinkLabel }}</a>
    </div>
  </div>
</template>
