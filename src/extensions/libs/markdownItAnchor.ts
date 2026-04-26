// In-tree anchor plugin: assigns slugged ids to every heading using
// pandoc's auto_identifiers convention. Output is `headingOpenToken.attrs
// = [['id', anchor]]` plus two custom fields (`headingContent`,
// `headingAnchor`) used by the TOC builder elsewhere.
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type { TokenWithAnchor } from './types/tokens';

export default function markdownItAnchor(md: MarkdownIt): void {
  md.core.ruler.before('replacements', 'anchors', (state) => {
    const anchorHash: Record<string, true> = {};
    let headingOpenToken: Token | undefined;
    let headingContent = '';
    state.tokens.forEach((token) => {
      if (token.type === 'heading_open') {
        headingContent = '';
        headingOpenToken = token;
      } else if (token.type === 'heading_close') {
        if (!headingOpenToken) return;
        (headingOpenToken as TokenWithAnchor).headingContent = headingContent;

        // According to http://pandoc.org/README.html#extension-auto_identifiers
        let slug = headingContent
          .replace(/\s/g, '-') // Replace all spaces and newlines with hyphens
          .replace(/[\0-,/:-@[-^`{-~]/g, '') // Remove all punctuation, except underscores, hyphens, and periods
          .toLowerCase(); // Convert all alphabetic characters to lowercase

        // Remove everything up to the first letter
        let i: number;
        for (i = 0; i < slug.length; i += 1) {
          const charCode = slug.charCodeAt(i);
          if ((charCode >= 0x61 && charCode <= 0x7A) || charCode > 0x7E) {
            break;
          }
        }

        // If nothing left after this, use `section`
        slug = slug.slice(i) || 'section';

        let anchor = slug;
        let index = 1;
        while (Object.prototype.hasOwnProperty.call(anchorHash, anchor)) {
          anchor = `${slug}-${index}`;
          index += 1;
        }
        anchorHash[anchor] = true;
        (headingOpenToken as TokenWithAnchor).headingAnchor = anchor;
        headingOpenToken.attrs = [
          ['id', anchor],
        ];
        headingOpenToken = undefined;
      } else if (headingOpenToken && token.children) {
        headingContent += token.children.reduce<string>((result, child) => {
          if (child.type !== 'footnote_ref') {
            return result + (child.content ?? '');
          }
          return result;
        }, '');
      }
    });
  });
}
