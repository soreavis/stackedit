<template>
  <div class="form-entry" :error="error">
    <label class="form-entry__label" :for="uid">{{ label }}<span class="form-entry__label-info" v-if="info"> &mdash; {{ info }}</span></label>
    <div class="form-entry__field">
      <slot name="field"></slot>
    </div>
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import utils from '../../../services/utils';

export default defineComponent({
  props: ['label', 'info', 'error'],
  data: () => ({
    uid: utils.uid(),
  }),
  mounted() {
    const field = this.$el.querySelector('input,select');
    if (field) {
      field.id = this.uid;
    }
  },
});
</script>
