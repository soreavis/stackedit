<template>
  <modal-inner class="modal__inner-1--command-palette" aria-label="Command palette">
    <div class="modal__content">
      <input
        ref="input"
        type="text"
        class="textfield command-palette__input"
        v-model="query"
        placeholder="Type a command…"
        autocomplete="off"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="run()"
        @keydown.esc.stop="close()"
      >
      <div class="command-palette__list" ref="list">
        <button
          v-for="(cmd, idx) in filtered"
          :key="cmd.id"
          :ref="`item-${idx}`"
          class="command-palette__item"
          :class="{ 'command-palette__item--active': idx === selectedIdx }"
          @click="run(idx)"
          @mouseenter="selectedIdx = idx"
        >
          <span class="command-palette__name">{{ cmd.name }}</span>
          <span v-if="cmd.group" class="command-palette__group">{{ cmd.group }}</span>
        </button>
        <div v-if="!filtered.length" class="command-palette__empty">No matching commands.</div>
      </div>
    </div>
  </modal-inner>
</template>

<script>
import { mapState as mapPiniaState } from 'pinia';
import { useModalStore } from '../../stores/modal';
import ModalInner from './common/ModalInner';
import customToolbarButtons from '../../data/customToolbarButtons';
import pagedownButtons from '../../data/pagedownButtons';
import editorSvc from '../../services/editorSvc';
import { useContentStore } from '../../stores/content';
import badgeSvc from '../../services/badgeSvc';

// Build a flat list of executable commands from the toolbar configs.
function buildCommands() {
  const list = [];
  // Pagedown buttons (bold, italic, etc.)
  pagedownButtons.forEach((btn) => {
    if (!btn.method) return;
    list.push({
      id: `pd:${btn.method}`,
      name: btn.title,
      group: 'Format',
      perform: () => {
        if (!useContentStore().isCurrentEditable) return;
        editorSvc.pagedownEditor.uiManager.doClick(btn.method);
        badgeSvc.addBadge('formatButtons');
      },
    });
  });
  // Custom toolbar buttons (math, mermaid, callout, etc.)
  customToolbarButtons.forEach((btn) => {
    if (!btn.method) return;
    if (btn.dropdown) {
      btn.items.forEach((item) => {
        list.push({
          id: `${btn.method}:${item.name}`,
          name: `${btn.title}: ${item.name}`,
          group: 'Insert',
          perform: () => item.perform(editorSvc),
        });
      });
    } else {
      list.push({
        id: btn.method,
        name: btn.title,
        group: 'Insert',
        perform: () => btn.action(editorSvc),
      });
    }
  });
  return list;
}

const ALL_COMMANDS = buildCommands();

// Lightweight fuzzy: every char of the query has to appear in the cmd name
// in order. Cheap, no external dep, works for "mer dia" → "Mermaid diagram".
function fuzzyMatch(query, name) {
  if (!query) return true;
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  let qi = 0;
  for (let ni = 0; ni < n.length && qi < q.length; ni += 1) {
    if (n[ni] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

export default {
  components: {
    ModalInner,
  },
  data: () => ({
    query: '',
    selectedIdx: 0,
  }),
  computed: {
    ...mapPiniaState(useModalStore, [
      'config',
    ]),
    filtered() {
      const all = ALL_COMMANDS.filter(c => fuzzyMatch(this.query, c.name));
      // Cap to 50 — the list is long and rendering hundreds of items hurts.
      return all.slice(0, 50);
    },
  },
  watch: {
    query() {
      this.selectedIdx = 0;
    },
  },
  mounted() {
    this.$nextTick(() => {
      if (this.$refs.input) this.$refs.input.focus();
    });
  },
  methods: {
    move(dir) {
      const next = this.selectedIdx + dir;
      if (next < 0) this.selectedIdx = this.filtered.length - 1;
      else if (next >= this.filtered.length) this.selectedIdx = 0;
      else this.selectedIdx = next;
      // Scroll selected item into view if needed.
      this.$nextTick(() => {
        const refArr = this.$refs[`item-${this.selectedIdx}`];
        const el = Array.isArray(refArr) ? refArr[0] : refArr;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      });
    },
    run(idx) {
      const i = typeof idx === 'number' ? idx : this.selectedIdx;
      const cmd = this.filtered[i];
      if (!cmd) return;
      this.config.resolve();
      // Defer execution one tick so the modal closes before the action runs
      // (some actions reach for the editor / open a dropdown).
      this.$nextTick(() => {
        try {
          cmd.perform();
        } catch (e) {
          console.error('[command-palette]', cmd.id, e);
        }
      });
    },
    close() {
      this.config.reject();
    },
  },
};
</script>

<style lang="scss">
.modal__inner-1--command-palette {
  max-width: 540px;
}

.command-palette__input {
  width: 100%;
  font-size: 16px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid transparent;
  border-radius: 4px;

  &:focus {
    background: #fff;
    border-color: #349be8;
    outline: none;
  }
}

.command-palette__list {
  max-height: 360px;
  overflow-y: auto;
}

.command-palette__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  text-transform: none;
  color: inherit;

  &--active {
    background: rgba(52, 155, 232, 0.12);
  }
}

.command-palette__name {
  color: rgba(0, 0, 0, 0.85);
}

.command-palette__group {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.command-palette__empty {
  padding: 16px 12px;
  color: rgba(0, 0, 0, 0.5);
  font-size: 13px;
  text-align: center;
}
</style>
