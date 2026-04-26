import { createLocationStore } from './locationStoreFactory';
import empty from '../data/empties/emptySyncLocation';

export const useSyncLocationStore = createLocationStore('syncLocation', empty);
