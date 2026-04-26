import ModalInner from './ModalInner';
import FormEntry from './FormEntry';
import { useFileStore } from '../../../stores/file';
import { useModalStore } from '../../../stores/modal';
import { useDataStore } from '../../../stores/data';

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
        return useDataStore().localSettings[id];
      },
      set(value) {
        useDataStore().patchLocalSettings({
          [id]: value,
        });
      },
    };
    if (key === 'selectedTemplate') {
      component.computed.allTemplatesById = () => {
        const allTemplatesById = useDataStore().allTemplatesById;
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
        useDataStore().patchLocalSettings({
          [id]: selectedId,
        });
      };
    }
  });
  component.computedLocalSettings = null;
  return component;
};
