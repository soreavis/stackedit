<template>
  <div class="user-image" :style="{backgroundImage: url}">
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import userSvc from '../services/userSvc';
import { useUserInfoStore } from '../stores/userInfo';

export default defineComponent({
  props: ['userId'],
  computed: {
    sanitizedUserId() {
      return userSvc.sanitizeUserId(this.userId);
    },
    url() {
      const userInfo = useUserInfoStore().itemsById[this.sanitizedUserId];
      return userInfo && userInfo.imageUrl && `url('${userInfo.imageUrl}')`;
    },
  },
  watch: {
    sanitizedUserId: {
      handler(sanitizedUserId) { userSvc.addUserId(sanitizedUserId); },
      immediate: true,
    },
  },
});
</script>

<style lang="scss">
.user-image {
  width: 100%;
  height: 100%;
  background-color: #fff;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
</style>
