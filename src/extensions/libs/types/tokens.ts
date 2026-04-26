// Shared markdown-it token augmentations used by the in-tree plugins
// (`markdownItAnchor`, `markdownItMath`). Each plugin attaches its own
// custom fields to specific tokens — collected here so other consumers
// (TOC builder, math renderer) can read them with proper types.
import type Token from 'markdown-it/lib/token.mjs';

export interface TokenWithAnchor extends Token {
  // Set by markdownItAnchor on heading_open tokens.
  headingContent?: string;
  headingAnchor?: string;
}
