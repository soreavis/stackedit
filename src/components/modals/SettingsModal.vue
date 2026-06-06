<template>
  <modal-inner class="modal__inner-1--settings" aria-label="Settings">
    <div class="modal__header modal__header--settings">
      <div class="tabs flex flex--row">
        <tab :active="tab === 'custom'" @click="tab = 'custom'">
          Custom settings
        </tab>
        <tab :active="tab === 'default'" @click="tab = 'default'">
          Default settings
        </tab>
      </div>
    </div>
    <div class="modal__content">
      <transition name="tab-swap" mode="out-in">
        <div class="form-entry" v-if="tab === 'custom'" key="tab-custom" role="tabpanel" aria-label="Custom settings">
          <label class="form-entry__label">YAML</label>
          <div class="form-entry__field form-entry__field--code-editor">
            <code-editor lang="yaml" :value="customSettings" key="custom-settings" @changed="setCustomSettings"></code-editor>
          </div>
        </div>
        <div class="form-entry" v-else-if="tab === 'default'" key="tab-default" role="tabpanel" aria-label="Default settings">
          <label class="form-entry__label">YAML</label>
          <div class="form-entry__field form-entry__field--code-editor">
            <code-editor lang="yaml" :value="defaultSettings" key="default-settings" disabled="true"></code-editor>
          </div>
        </div>
      </transition>
      <div class="modal__error modal__error--settings">{{ error }}</div>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="cfg.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve">Ok</button>
    </div>
  </modal-inner>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import yaml from 'js-yaml';
import { mapState as mapPiniaState } from 'pinia';
import { useModalStore } from '../../stores/modal';
import ModalInner from './common/ModalInner.vue';
import Tab from './common/Tab.vue';
import CodeEditor from '../CodeEditor.vue';
import defaultSettings from '../../data/defaults/defaultSettings.yml?raw';
import badgeSvc from '../../services/badgeSvc';
import { useDataStore } from '../../stores/data';

const emptySettings = `# Add your custom settings here to override the
# default settings.
`;

export default defineComponent({
  components: {
    ModalInner,
    Tab,
    CodeEditor,
  },
  data: () => ({
    tab: 'custom',
    defaultSettings,
    customSettings: null as string | null,
    error: null as string | null,
  }),
  computed: {
    ...mapPiniaState(useModalStore, [
      'config',
    ]),
    // `config` is `ModalConfig | false`; this modal only renders when a
    // modal is open (config is set), so expose it loosely for resolve/reject.
    cfg(): any {
      return this.config;
    },
    strippedCustomSettings() {
      return this.customSettings === emptySettings ? '\n' : this.customSettings!.replace(/\t/g, '  ');
    },
  },
  created() {
    const settings = useDataStore().settings;
    this.setCustomSettings(settings === '\n' ? emptySettings : settings);
  },
  methods: {
    setCustomSettings(value: string) {
      this.customSettings = value;
      try {
        yaml.load(this.strippedCustomSettings);
        this.error = null;
      } catch (e) {
        this.error = (e as Error).message;
      }
    },
    async resolve() {
      if (!this.error) {
        const settings = this.strippedCustomSettings;
        await useDataStore().setSettings(settings);
        const customSettings = yaml.load(settings) as any;
        if (customSettings.shortcuts) {
          badgeSvc.addBadge('changeShortcuts');
        }
        const computedSettings = useDataStore().computedSettings as any;
        const customSettingsCount = Object
          .keys(customSettings)
          .filter((key: string) => key !== 'shortcuts' && computedSettings[key])
          .length;
        if (customSettingsCount) {
          badgeSvc.addBadge('changeSettings');
        }
        (this.config as any).resolve(settings);
      }
    },
  },
});
</script>

<style lang="scss">
@use '../../styles/variables.scss' as *;

.modal__inner-1.modal__inner-1--settings {
  max-width: 700px;
}

.modal__header--settings {
  padding-bottom: 0;
}

.modal__error--settings {
  white-space: pre-wrap;
  font-family: $font-family-monospace;
  font-size: $font-size-monospace;
}
</style>
