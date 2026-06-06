<template>
  <div class="modal__inner-1" role="dialog">
    <div class="modal__inner-2">
      <button class="modal__close-button button not-tabbable" @click="cfg.reject()" v-title="'Close modal'">
        <icon-close></icon-close>
      </button>
      <slot></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapState as mapPiniaState } from 'pinia';
import { useModalStore } from '../../../stores/modal';

export default defineComponent({
  computed: {
    ...mapPiniaState(useModalStore, [
      'config',
    ]),
    // `config` is `ModalConfig | false`, but this inner is only rendered
    // when a modal is open, so config is always set here.
    cfg(): any {
      return this.config;
    },
  },
});
</script>

<style lang="scss">
@use '../../../styles/variables.scss' as *;

.modal__close-button {
  position: absolute;
  top: 8px;
  right: 8px;
  color: rgba(0, 0, 0, 0.5);
  width: 32px;
  height: 32px;
  padding: 2px;

  &:active,
  &:focus,
  &:hover {
    color: rgba(0, 0, 0, 0.67);
  }
}
</style>
