// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import simpleModals from '../../../src/data/simpleModals.js';

// simpleModals is a flat dictionary of `{ contentHtml, rejectText,
// resolveText }` entries keyed by modal type. Each entry's contentHtml is
// rendered via v-html in `Modal.vue` and routed through DOMPurify by the
// project invariants — so the test surface here is shape integrity, not
// XSS vectors (those are covered in the htmlSanitizer specs).

describe('simpleModals registry', () => {
  // The full set of modal types the app ever opens via `modal/open <type>`.
  // If a future refactor accidentally drops one, this catches it before
  // any caller hits an empty modal at runtime.
  const expected = [
    'bulkDeletion',
    'commentDeletion',
    'discussionDeletion',
    'fileRestoration',
    'folderDeletion',
    'pathConflict',
    'paymentSuccess',
    'providerRedirection',
    'removeWorkspace',
    'reset',
    'signInForComment',
    'signInForSponsorship',
    'sponsorOnly',
    'stripName',
    'tempFileDeletion',
    'tempFolderDeletion',
    'textStats',
    'trashDeletion',
    'unauthorizedName',
    'workspaceGoogleRedirection',
  ];

  it.each(expected)('exposes %s', (key) => {
    expect(simpleModals[key]).toBeTruthy();
  });

  it.each(expected)('%s exposes a callable contentHtml', (key) => {
    const modal = simpleModals[key];
    expect(typeof modal.contentHtml).toBe('function');
  });

  it('contentHtml accepts plain config and returns a string', () => {
    // Generic / context-free modals — no config dependencies.
    const stateless = ['paymentSuccess', 'reset', 'sponsorOnly', 'trashDeletion'];
    stateless.forEach((key) => {
      const html = simpleModals[key].contentHtml({});
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });
  });

  it('confirmation-style modals expose both reject and resolve labels', () => {
    // Pattern: deletion / destructive flows give the user a way to bail.
    const confirms = ['bulkDeletion', 'commentDeletion', 'folderDeletion', 'reset', 'tempFileDeletion'];
    confirms.forEach((key) => {
      expect(simpleModals[key].rejectText).toBeTruthy();
      expect(simpleModals[key].resolveText).toBeTruthy();
    });
  });

  it('every modal renders at least one button label', () => {
    // simpleModal(contentHtml, rejectText, resolveText) — at least one of
    // rejectText / resolveText must be set, otherwise Modal.vue produces
    // a card with no way to close it. (Project convention: info-style
    // modals like `trashDeletion` / `paymentSuccess` / `sponsorOnly` have
    // only `rejectText` set as the acknowledgment label — quirky but
    // documented in Modal.vue's button-bar template.)
    Object.entries(simpleModals).forEach(([key, modal]) => {
      const hasButton = !!modal.rejectText || !!modal.resolveText;
      expect(hasButton, `${key} has no button label`).toBe(true);
    });
  });

  it('textStats renders a multi-section html structure', () => {
    // Exercises the recently-added textStats modal end-to-end:
    // - title from `scope`
    // - section headers from `lines[].section`
    // - rows from `lines[].label` + `lines[].value`
    // - separators from `lines[].separator`
    const html = simpleModals.textStats.contentHtml({
      scope: 'Whole document',
      lines: [
        { section: 'Counts' },
        { label: 'Words', value: '42' },
        { separator: true },
        { section: 'Reading' },
        { label: 'Tokens', value: '~17' },
      ],
    });
    expect(html).toContain('Whole document');
    expect(html).toContain('text-stats__section');
    expect(html).toContain('Counts');
    expect(html).toContain('Words');
    expect(html).toContain('42');
    expect(html).toContain('text-stats__sep');
    expect(html).toContain('Reading');
    expect(html).toContain('~17');
  });

  it('bulkDeletion contentHtml summarizes counts from config', () => {
    // The bulk-deletion modal pluralizes / joins parts based on the
    // number of items being moved to trash vs permanently deleted.
    const html = simpleModals.bulkDeletion.contentHtml({
      toTrash: 3,
      permanent: 2,
      folders: 1,
    });
    expect(html).toContain('3 items');
    expect(html).toContain('permanently delete 2 items');
    expect(html).toContain('1 folder');
  });
});
