import ModalInner from './ModalInner';
import FormEntry from './FormEntry';
import store from '../../../store';
import { useFileStore } from '../../../stores/file';
import { useModalStore } from '../../../stores/modal';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export default (desc) => {
  const component = {
    ...desc,
    data: () => ({
      ...desc.data ? desc.data() : {},
      errorTimeouts: {},
    }),
    components: {
      ...desc.components || {},
      ModalInner,
      FormEntry,
    },
    computed: {
      ...desc.computed || {},
      config() {
        return useModalStore().config;
      },
      currentFileName() {
        return useFileStore().current.name;
      },
    },
    methods: {
      ...desc.methods || {},
      openFileProperties: () => useModalStore().open('fileProperties'),
      setError(name) {
        clearTimeout(this.errorTimeouts[name]);
        const formEntry = this.$el.querySelector(`.form-entry[error=${name}]`);
        if (formEntry) {
          formEntry.classList.add('form-entry--error');
          this.errorTimeouts[name] = setTimeout(() => {
            formEntry.classList.remove('form-entry--error');
          }, 1000);
        }
      },
    },
  };
  Object.entries(desc.computedLocalSettings || {}).forEach(([key, id]) => {
    component.computed[key] = {
      get() {
        return store.getters['data/localSettings'][id];
      },
      set(value) {
        store.dispatch('data/patchLocalSettings', {
          [id]: value,
        });
      },
    };
    if (key === 'selectedTemplate') {
      component.computed.allTemplatesById = () => {
        const allTemplatesById = store.getters['data/allTemplatesById'];
        const sortedTemplatesById = {};
        Object.entries(allTemplatesById)
          .sort(([, template1], [, template2]) => collator.compare(template1.name, template2.name))
          .forEach(([templateId, template]) => {
            sortedTemplatesById[templateId] = template;
          });
        return sortedTemplatesById;
      };
      // Make use of `function` to have `this` bound to the component
      component.methods.configureTemplates = async function () {  
        const { selectedId } = await useModalStore().open({
          type: 'templates',
          selectedId: this.selectedTemplate,
        });
        store.dispatch('data/patchLocalSettings', {
          [id]: selectedId,
        });
      };
    }
  });
  component.computedLocalSettings = null;
  return component;
};
