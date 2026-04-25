<template>
  <span class="user-name">{{ name }}</span>
</template>

<script>
import userSvc from '../services/userSvc';
import { useUserInfoStore } from '../stores/userInfo';

export default {
  props: ['userId'],
  computed: {
    sanitizedUserId() {
      return userSvc.sanitizeUserId(this.userId);
    },
    name() {
      const userInfo = useUserInfoStore().itemsById[this.sanitizedUserId];
      return userInfo ? userInfo.name : 'Someone';
    },
  },
  watch: {
    sanitizedUserId: {
      handler(sanitizedUserId) { userSvc.addUserId(sanitizedUserId); },
      immediate: true,
    },
  },
};
</script>
