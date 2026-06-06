import { defineComponent } from 'vue';
import ModalInner from './ModalInner.vue';
import FormEntry from './FormEntry.vue';
import { useFileStore } from '../../../stores/file';
import { useModalStore, ModalConfig } from '../../../stores/modal';

// A modal component only ever renders while a modal is open, and `open()`
// always populates resolve/reject — so within a modal `config.resolve()` /
// `config.reject()` are safe. The store getter can't express that (it returns
// `ModalConfig | false`), so we narrow it once here instead of casting in
// every one of the ~31 modal templates.
export type OpenModalConfig = ModalConfig & {
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
  callback: (...args: unknown[]) => void;
};

/**
 * Shared base for every dialog modal authored via `<modal-inner>`. Mix this in
 * (`mixins: [baseModal]`) to get the common config/file/error surface plus the
 * ModalInner + FormEntry child components, with full vue-tsc typing.
 */
export default defineComponent({
  components: {
    ModalInner,
    FormEntry,
  },
  data: () => ({
    errorTimeouts: {} as Record<string, ReturnType<typeof setTimeout>>,
  }),
  computed: {
    config(): OpenModalConfig {
      return useModalStore().config as unknown as OpenModalConfig;
    },
    currentFileName(): string {
      return useFileStore().current.name;
    },
  },
  methods: {
    openFileProperties(): Promise<unknown> {
      return useModalStore().open('fileProperties');
    },
    setError(name: string): void {
      clearTimeout(this.errorTimeouts[name]);
      const formEntry = (this.$el as Element).querySelector(`.form-entry[error=${name}]`);
      if (formEntry) {
        formEntry.classList.add('form-entry--error');
        this.errorTimeouts[name] = setTimeout(() => {
          formEntry.classList.remove('form-entry--error');
        }, 1000);
      }
    },
  },
});
