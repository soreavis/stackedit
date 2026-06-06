<template>
  <modal-inner class="modal__inner-1--file-properties" aria-label="File properties">
    <div class="modal__header modal__header--file-properties">
      <div class="tabs flex flex--row">
        <tab :active="tab === 'simple'" @click="setSimpleTab()">
          Simple properties
        </tab>
        <tab :active="tab === 'yaml'" @click="setYamlTab()">
          YAML properties
        </tab>
      </div>
    </div>
    <div class="modal__content">
      <transition name="tab-swap" mode="out-in">
        <div v-if="tab === 'simple'" key="tab-simple">
        <div class="modal__title">Extensions</div>
        <div class="modal__sub-title">Configure the Markdown engine.</div>
        <form-entry label="Preset">
          <template #field>
            <select class="textfield" v-model="preset" @keydown.enter="resolve()">
              <option v-for="(preset, id) in presets" :key="id" :value="preset">
                {{ preset }}
              </option>
            </select>
          </template>
        </form-entry>
        <div class="modal__title">Metadata</div>
        <div class="modal__sub-title">Add info to your publications (Wordpress, Blogger...).</div>
        <form-entry label="Title">
          <template #field><input class="textfield" type="text" v-model.trim="title" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Author">
          <template #field><input class="textfield" type="text" v-model.trim="author" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Tags" info="comma-separated">
          <template #field><input class="textfield" type="text" v-model.trim="tags" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Categories" info="comma-separated">
          <template #field><input class="textfield" type="text" v-model.trim="categories" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Excerpt">
          <template #field><input class="textfield" type="text" v-model.trim="excerpt" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Featured image">
          <template #field><input class="textfield" type="text" v-model.trim="featuredImage" @keydown.enter="resolve()"></template>
        </form-entry>
        <form-entry label="Status">
          <template #field><input class="textfield" type="text" v-model.trim="status" @keydown.enter="resolve()"></template>
          <div class="form-entry__info">
            <b>Example:</b> draft
          </div>
        </form-entry>
        <form-entry label="Date" info="YYYY-MM-DD">
          <template #field><input class="textfield" type="text" v-model.trim="date" @keydown.enter="resolve()"></template>
        </form-entry>
      </div>
      <div v-else-if="tab === 'yaml'" key="tab-yaml">
        <div class="form-entry" role="tabpanel" aria-label="YAML properties">
          <label class="form-entry__label">YAML</label>
          <div class="form-entry__field">
            <code-editor lang="yaml" :value="yamlProperties" key="custom-properties" @changed="setYamlProperties"></code-editor>
          </div>
        </div>
        <div class="modal__error modal__error--file-properties">{{ error }}</div>
        <div class="modal__info modal__info--multiline">
          <p><strong>ProTip:</strong> You can manually toggle extensions:</p>
          <pre class=" language-yaml"><code class="prism  language-yaml"><span class="token key atrule">extensions</span><span class="token punctuation">:</span>
  <span class="token key atrule">emoji</span><span class="token punctuation">:</span>
    <span class="token comment"># Enable emoji shortcuts like :) :-(</span>
    <span class="token key atrule">shortcuts</span><span class="token punctuation">:</span> <span class="token boolean important">true</span>
</code></pre>
          <p>Use preset <code>zero</code> to make your own configuration:</p>
          <pre class=" language-yaml"><code class="prism  language-yaml"><span class="token key atrule">extensions</span><span class="token punctuation">:</span>
  <span class="token key atrule">preset</span><span class="token punctuation">:</span> zero
  <span class="token key atrule">markdown</span><span class="token punctuation">:</span>
    <span class="token key atrule">table</span><span class="token punctuation">:</span> <span class="token boolean important">true</span>
  <span class="token key atrule">katex</span><span class="token punctuation">:</span>
    <span class="token key atrule">enabled</span><span class="token punctuation">:</span> <span class="token boolean important">true</span>
</code></pre>
          <p>For the full list of options, see <a href="https://github.com/soreavis/stackedit/blob/main/src/data/presets.js" target="_blank" rel="noopener noreferrer">here</a>.</p>
        </div>
      </div>
      </transition>
    </div>
    <div class="modal__button-bar">
      <button class="button" @click="cfg.reject()">Cancel</button>
      <button class="button button--resolve" @click="resolve()">Ok</button>
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
import FormEntry from './common/FormEntry.vue';
import CodeEditor from '../CodeEditor.vue';
import utils from '../../services/utils';
import presets from '../../data/presets';
import { useContentStore } from '../../stores/content';
import badgeSvc from '../../services/badgeSvc';
import { useDataStore } from '../../stores/data';

const metadataProperties = {
  title: '',
  author: '',
  tags: '',
  categories: '',
  excerpt: '',
  featuredImage: '',
  status: '',
  date: '',
};

export default defineComponent({
  components: {
    ModalInner,
    Tab,
    FormEntry,
    CodeEditor,
  },
  data: () => ({
    contentId: null as string | null,
    yamlProperties: null as string | null,
    preset: '',
    error: null as string | null,
    properties: null as any,
    ...metadataProperties,
  }),
  computed: {
    ...mapPiniaState(useModalStore, [
      'config',
    ]),
    cfg(): any {
      return this.config;
    },
    presets: () => Object.keys(presets).sort(),
    tab: {
      get() {
        return useDataStore().localSettings.filePropertiesTab;
      },
      set(value: string) {
        useDataStore().patchLocalSettings({
          filePropertiesTab: value,
        });
      },
    },
  },
  created() {
    const content = (useContentStore() as any).current;
    this.contentId = content.id;
    this.setYamlProperties(content.properties);
    if (this.tab === 'simple') {
      this.setSimpleTab();
    } else if (this.tab !== 'yaml') {
      // Legacy '' default (pre-yaml-default users) — land on YAML.
      this.tab = 'yaml';
    }
  },
  methods: {
    yamlToSimple() {
      const properties = this.properties || {};
      const extensions = properties.extensions || {};
      this.preset = extensions.preset;
      if (!this.presets.includes(this.preset)) {
        this.preset = 'default';
      }
      Object.keys(metadataProperties).forEach((name: string) => {
        (this as any)[name] = `${properties[name] || ''}`;
      });
    },
    simpleToYaml() {
      let hasChanged = false;
      const properties = this.properties || {};
      const extensions = properties.extensions || {};
      if (this.preset !== extensions.preset) {
        if (this.preset !== 'default') {
          extensions.preset = this.preset;
          hasChanged = true;
        } else if (extensions.preset) {
          delete extensions.preset;
          hasChanged = true;
        }
      }
      Object.keys(metadataProperties).forEach((name: string) => {
        if ((this as any)[name] !== properties[name]) {
          if ((this as any)[name]) {
            properties[name] = (this as any)[name];
            hasChanged = true;
          } else if (properties[name]) {
            delete properties[name];
            hasChanged = true;
          }
        }
      });
      if (hasChanged) {
        if (Object.keys(extensions).length) {
          properties.extensions = extensions;
        } else {
          delete properties.extensions;
        }
        this.setYamlProperties(Object.keys(properties).length
          ? yaml.dump(properties)
          : '\n');
      }
    },
    setSimpleTab() {
      this.tab = 'simple';
      this.yamlToSimple();
    },
    setYamlTab() {
      this.tab = 'yaml';
      this.simpleToYaml();
    },
    setYamlProperties(value: string) {
      this.yamlProperties = value;
      try {
        this.properties = yaml.load(value);
        this.error = null;
      } catch (e) {
        this.error = (e as Error).message;
      }
    },
    resolve() {
      if (this.tab === 'simple') {
        // Compute YAML properties
        this.simpleToYaml();
      }
      if (this.error) {
        this.setYamlTab();
      } else {
        const properties = this.properties || {};
        if (Object.keys(metadataProperties).some((key: string) => properties[key])) {
          badgeSvc.addBadge('setMetadata');
        }
        const extensions = properties.extensions || {};
        if (extensions.preset) {
          badgeSvc.addBadge('changePreset');
        }
        if (Object.keys(extensions).filter((key: string) => key !== 'preset').length) {
          badgeSvc.addBadge('changeExtension');
        }
        useContentStore().patchItem({
          id: this.contentId as string,
          properties: utils.sanitizeText(this.yamlProperties),
        });
        this.cfg.resolve();
      }
    },
  },
});
</script>

<style lang="scss">
@use '../../styles/variables.scss' as *;

.modal__inner-1.modal__inner-1--file-properties {
  max-width: 650px;
}

.modal__header--file-properties {
  padding-bottom: 0;
}

.modal__error--file-properties {
  white-space: pre-wrap;
  font-family: $font-family-monospace;
  font-size: $font-size-monospace;
}
</style>
