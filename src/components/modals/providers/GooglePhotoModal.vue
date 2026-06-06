<template>
  <modal-inner class="modal__inner-1--google-photo" aria-label="Import Google Photo">
    <div class="modal__content">
      <div class="google-photo__tumbnail" :style="{backgroundImage: thumbnailUrl}"></div>
      <form-entry label="Title" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="title" @keydown.enter="resolve()"></template>
      </form-entry>
      <form-entry label="Size limit" info="optional">
        <template #field><input class="textfield" type="text" v-model.trim="size" @keydown.enter="resolve()"></template>
      </form-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapState as mapPiniaState } from 'pinia';
import { useModalStore } from '../../../stores/modal';
import ModalInner from '../common/ModalInner.vue';
import FormEntry from '../common/FormEntry.vue';

const makeThumbnail = (url: string, size: number) => `${url}=s${size}`;

export default defineComponent({
  components: {
    ModalInner,
    FormEntry,
  },
  data: () => ({
    title: '',
    size: '',
  }),
  computed: {
    // The modal store `config` getter is `ModalConfig | false`; this modal only
    // renders when a modal is open, so `config` is always set here. Cast at the
    // boundary so the GooglePhoto-specific fields (url/callback/resolve/reject)
    // are accessible without changing the runtime guards.
    cfg(): any {
      return this.config;
    },
    thumbnailUrl(): string {
      return `url(${makeThumbnail(this.cfg.url, 320)})`;
    },
    ...mapPiniaState(useModalStore, [
      'config',
    ]),
  },
  methods: {
    resolve() {
      let { url } = this.cfg;
      const size = parseInt(this.size, 10);
      if (!Number.isNaN(size)) {
        url = makeThumbnail(url, size);
      }
      if (this.title) {
        url += ` "${this.title}"`;
      }
      const { callback } = this.cfg;
      this.cfg.resolve();
      callback(url);
    },
    reject() {
      const { callback } = this.cfg;
      this.cfg.reject();
      callback(null);
    },
  },
});
</script>

<style lang="scss">
.google-photo__tumbnail {
  height: 160px;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}
</style>
