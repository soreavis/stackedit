import { defineComponent } from 'vue';
import { useDataStore, AdditionalTemplate } from '../../../stores/data';
import { useModalStore } from '../../../stores/modal';

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

/**
 * Mixed into the export/publish modals that let the user pick + configure a
 * template (`allTemplatesById` + `configureTemplates`). The host modal must
 * declare `templateSettingId` (the localSettings key holding the chosen
 * template id) and a `selectedTemplate` computed (via `localSetting`).
 */
export default defineComponent({
  data: () => ({
    // Overridden by each host modal with its own setting key.
    templateSettingId: '',
  }),
  computed: {
    allTemplatesById(): Record<string, AdditionalTemplate> {
      const all = useDataStore().allTemplatesById;
      const sorted: Record<string, AdditionalTemplate> = {};
      Object.entries(all)
        .sort(([, a], [, b]) => collator.compare(a.name, b.name))
        .forEach(([id, template]) => {
          sorted[id] = template;
        });
      return sorted;
    },
  },
  methods: {
    async configureTemplates(): Promise<void> {
      const { selectedId } = await useModalStore().open({
        type: 'templates',
        selectedId: (this as { selectedTemplate?: unknown }).selectedTemplate,
      }) as { selectedId: string };
      useDataStore().patchLocalSettings({ [this.templateSettingId]: selectedId });
    },
  },
});
