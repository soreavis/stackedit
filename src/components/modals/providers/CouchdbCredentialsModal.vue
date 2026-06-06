<template>
  <modal-inner aria-label="Insert image">
    <div class="modal__content">
      <div class="modal__image">
        <icon-provider provider-id="couchdb"></icon-provider>
      </div>
      <p>Please provide your credentials to login to <b>CouchDB</b>.</p>
      <form-entry label="Name" error="name">
        <template #field><input class="textfield" type="text" v-model.trim="name" @keydown.enter="resolve()"></template>
      </form-entry>
      <form-entry label="Password" error="password">
        <template #field><input class="textfield" type="password" v-model.trim="password" @keydown.enter="resolve()"></template>
      </form-entry>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="config.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
    </div>
  </modal-inner>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import baseModal from '../common/baseModal';
import { useDataStore } from '../../../stores/data';

export default defineComponent({
  mixins: [baseModal],
  data: () => ({
    name: '',
    password: '',
  }),
  created() {
    const token = this.config.token as { name: string; password: string };
    this.name = token.name;
    this.password = token.password;
  },
  methods: {
    resolve() {
      if (!this.name) {
        this.setError('name');
      }
      if (!this.password) {
        this.setError('password');
      }
      if (this.name && this.password) {
        const token = {
          ...(this.config.token as Record<string, unknown>),
          name: this.name,
          password: this.password,
        };
        useDataStore().addCouchdbToken(token as any);
        this.config.resolve();
      }
    },
  },
});
</script>
