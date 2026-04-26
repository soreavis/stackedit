import { createLocationStore } from './locationStoreFactory';
import empty from '../data/empties/emptyPublishLocation';

export const usePublishLocationStore = createLocationStore('publishLocation', empty);
