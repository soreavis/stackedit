// In-tree tasklist plugin: renders `- [ ]` / `- [x]` GFM task list items
// as a leading `<span class="task-list-item-checkbox">` plus a
// `task-list-item` class on the surrounding `<li>`. Replaces the dropped
// `markdown-it-task-lists` package — same output shape, no maintenance
// dependency.
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

function attrSet(token: Token, name: string, value: string): void {
  const index = token.attrIndex(name);
  const attr: [string, string] = [name, value];

  if (index < 0) {
    token.attrPush(attr);
  } else if (token.attrs) {
    token.attrs[index] = attr;
  }
}

export default function markdownItTasklist(md: MarkdownIt): void {
  md.core.ruler.after('inline', 'tasklist', ({ tokens, Token: TokenCtor }) => {
    for (let i = 2; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (
        token.content
        && token.content.charCodeAt(0) === 0x5b /* [ */
        && token.content.charCodeAt(2) === 0x5d /* ] */
        && token.content.charCodeAt(3) === 0x20 /* space */
        && token.type === 'inline'
        && tokens[i - 1].type === 'paragraph_open'
        && tokens[i - 2].type === 'list_item_open'
      ) {
        const cross = token.content[1].toLowerCase();
        if (cross === ' ' || cross === 'x') {
          const checkbox = new TokenCtor('html_inline', '', 0);
          if (cross === ' ') {
            checkbox.content = '<span class="task-list-item-checkbox" type="checkbox">&#9744;</span>';
          } else {
            checkbox.content = '<span class="task-list-item-checkbox checked" type="checkbox">&#9745;</span>';
          }
          if (token.children) {
            token.children.unshift(checkbox);
            if (token.children[1]) {
              token.children[1].content = token.children[1].content.slice(3);
            }
          }
          token.content = token.content.slice(3);
          attrSet(tokens[i - 2], 'class', 'task-list-item');
        }
      }
    }
  });
}
