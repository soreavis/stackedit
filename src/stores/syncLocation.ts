import { createLocationStore, LocationItem } from './locationStoreFactory';
import emptySyncLocationRaw from '../data/empties/emptySyncLocation';

export interface SyncLocation extends LocationItem {
  type?: string;
  hash: number;
}

const emptySyncLocation = emptySyncLocationRaw as unknown as (id?: string) => SyncLocation;

export const useSyncLocationStore = createLocationStore<SyncLocation>('syncLocation', emptySyncLocation);
