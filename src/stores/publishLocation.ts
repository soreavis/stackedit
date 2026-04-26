import { createLocationStore, LocationItem } from './locationStoreFactory';
import emptyPublishLocationRaw from '../data/empties/emptyPublishLocation';

export interface PublishLocation extends LocationItem {
  type?: string;
  templateId?: string | null;
  hash: number;
}

const emptyPublishLocation = emptyPublishLocationRaw as unknown as (id?: string) => PublishLocation;

export const usePublishLocationStore = createLocationStore<PublishLocation>('publishLocation', emptyPublishLocation);
