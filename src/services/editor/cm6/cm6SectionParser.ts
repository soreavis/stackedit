// Stage 3 batch 2 — section-list bridge between markdown-it and CM6.
//
// cledit's contract (the integration the rest of the app depends on):
//   parsingCtx.sectionList: Array<{ data: 'main' | 'list' | ... ; text: string }>
// produced by `markdownConversionSvc.parseSections(converter, text)`.
//
// `parseSectionsForCm6` is a thin wrapper that takes the converter and
// raw doc text and returns the same `{ data, text }` shape — pure
// function, no CM6 lifecycle dependency. Future batches will wrap this
// in a `ViewPlugin` once the full editorSvc / CM6 integration lands.
import markdownConversionSvc from '../../markdownConversionSvc';

export interface SectionEntry {
  data: string;
  text: string;
}

export function parseSectionsForCm6(converter: unknown, text: string): SectionEntry[] {
  if (!converter) return [];
  const ctx = (markdownConversionSvc as unknown as {
    parseSections: (c: unknown, t: string) => { sections: SectionEntry[] };
  }).parseSections(converter, text);
  return ctx.sections;
}
