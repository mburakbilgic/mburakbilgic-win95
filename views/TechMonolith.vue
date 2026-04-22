<script setup>
import { useContent } from '@/composables/useContent'

const { techMonolith } = useContent()
</script>

<template>
  <div>
    <img :src="techMonolith.logoUrl" :alt="techMonolith.logoAlt" class="hero" />

    <template v-for="phase in techMonolith.phases" :key="phase.id">
      <div class="inner-content">
        <h3 class="heading"><b>{{ phase.title }}</b></h3>
        <p v-for="p in phase.paragraphs" :key="p.id" class="paragraph">
          {{ p.text }}
        </p>
      </div>
      <template v-if="phase.image">
        <img
          :src="phase.image.url"
          :class="phase.image.variant === 'full' ? 'images-full' : 'images'"
        />
        <h6 class="subtitle">{{ phase.image.caption }}</h6>
        <br v-if="phase.image.variant === 'full'" />
      </template>
    </template>

    <a :href="techMonolith.companyUrl" style="color: #ff5733">{{ techMonolith.companyLabel }}</a>
  </div>
</template>

<style scoped>
.hero {
  width: 100%;
  background-position: center center;
  background-size: 100%;
  background-repeat: no-repeat;
  border: 1px solid rgb(0, 0, 0, 0.1);
}

.images {
  width: 100%;
  height: 350px;
  object-fit: cover;
}

.images-full {
  width: 100%;
  height: auto;
  object-fit: cover;
}

.subtitle {
  font-size: 12px;
  color: gray;
  text-align: center;
}

.heading {
  padding-bottom: 5px;
}

.inner-content {
  padding-top: 30px;
  padding-bottom: 30px;
}

h6,
h3 {
  margin: 0;
  padding: 0;
}
</style>
