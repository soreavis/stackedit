// Ambient declaration so plain `tsc` (e.g. editor/CI typecheck hooks) can
// resolve `.vue` single-file-component imports from `.ts` files (icons/index,
// baseModal, the app entry, etc.). `vue-tsc` resolves the real component types
// directly and ignores this fallback for actual project `.vue` files.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, any>;
  export default component;
}
