const simpleModal = (contentHtml, rejectText, resolveText) => ({
  contentHtml: typeof contentHtml === 'function' ? contentHtml : () => contentHtml,
  rejectText,
  resolveText,
});

/* eslint sort-keys: "error" */
export default {
  bulkDeletion: simpleModal(
    (config) => {
      const parts = [];
      if (config.toTrash) {
        parts.push(`move ${config.toTrash} item${config.toTrash === 1 ? '' : 's'} to Trash`);
      }
      if (config.permanent) {
        parts.push(`permanently delete ${config.permanent} item${config.permanent === 1 ? '' : 's'}`);
      }
      const action = parts.length ? parts.join(' and ') : 'delete items';
      const folderNote = config.folders
        ? ` (including ${config.folders} folder${config.folders === 1 ? '' : 's'} with their contents)`
        : '';
      return `<p>You are about to ${action}${folderNote}. Are you sure?</p>`;
    },
    'No',
    'Yes, delete',
  ),
  commentDeletion: simpleModal(
    '<p>You are about to delete a comment. Are you sure?</p>',
    'No',
    'Yes, delete',
  ),
  discussionDeletion: simpleModal(
    '<p>You are about to delete a discussion. Are you sure?</p>',
    'No',
    'Yes, delete',
  ),
  fileRestoration: simpleModal(
    '<p>You are about to revert some changes. Are you sure?</p>',
    'No',
    'Yes, revert',
  ),
  folderDeletion: simpleModal(
    config => `<p>You are about to delete the folder <b>${config.item.name}</b>. Its files will be moved to Trash. Are you sure?</p>`,
    'No',
    'Yes, delete',
  ),
  pathConflict: simpleModal(
    config => `<p><b>${config.item.name}</b> already exists. Do you want to add a suffix?</p>`,
    'No',
    'Yes, add suffix',
  ),
  paymentSuccess: simpleModal(
    '<h3>Thank you for your payment!</h3><p>Your sponsorship will be active in a minute.</p>',
    'Ok',
  ),
  providerRedirection: simpleModal(
    config => `<p>You are about to navigate to the <b>${config.name}</b> authorization page.</p>`,
    'Cancel',
    'Ok, go on',
  ),
  removeWorkspace: simpleModal(
    '<p>You are about to remove a workspace locally. Are you sure?</p>',
    'No',
    'Yes, remove',
  ),
  reset: simpleModal(
    '<p>This will clean all your workspaces locally. Are you sure?</p>',
    'No',
    'Yes, clean',
  ),
  signInForComment: simpleModal(
    `<p>You have to sign in with Google to start commenting.</p>
    <div class="modal__info"><b>Note:</b> This will sync your main workspace.</div>`,
    'Cancel',
    'Ok, sign in',
  ),
  signInForSponsorship: simpleModal(
    `<p>You have to sign in with Google to sponsor.</p>
    <div class="modal__info"><b>Note:</b> This will sync your main workspace.</div>`,
    'Cancel',
    'Ok, sign in',
  ),
  sponsorOnly: simpleModal(
    '<p>This feature is restricted to sponsors as it relies on server resources.</p>',
    'Ok, I understand',
  ),
  stripName: simpleModal(
    config => `<p><b>${config.item.name}</b> contains illegal characters. Do you want to strip them?</p>`,
    'No',
    'Yes, strip',
  ),
  tempFileDeletion: simpleModal(
    config => `<p>You are about to permanently delete the temporary file <b>${config.item.name}</b>. Are you sure?</p>`,
    'No',
    'Yes, delete',
  ),
  tempFolderDeletion: simpleModal(
    '<p>You are about to permanently delete all the temporary files. Are you sure?</p>',
    'No',
    'Yes, delete all',
  ),
  textStats: simpleModal(
    (config) => {
      // Build a key:value table. `lines` is a flat array of {label, value}
      // entries plus optional {section: '...'} headers and {separator: true}
      // dividers. Renders as a definition-list-style block inside
      // .text-stats so each row aligns left/right.
      const rows = config.lines.map((row) => {
        if (row.section) {
          return `<div class="text-stats__section">${row.section}</div>`;
        }
        if (row.separator) {
          return '<div class="text-stats__sep"></div>';
        }
        return `<div class="text-stats__row"><span class="text-stats__label">${row.label}</span><span class="text-stats__value">${row.value}</span></div>`;
      }).join('');
      return `<h3 class="modal__title">${config.scope}</h3>
        <div class="text-stats">${rows}</div>`;
    },
    null,
    'OK',
  ),
  trashDeletion: simpleModal(
    '<p>Files in the trash are automatically deleted after 7 days of inactivity.</p>',
    'Ok',
  ),
  unauthorizedName: simpleModal(
    config => `<p><b>${config.item.name}</b> is an unauthorized name.</p>`,
    'Ok',
  ),
  workspaceGoogleRedirection: simpleModal(
    '<p>StackEdit needs full Google Drive access to open this workspace.</p>',
    'Cancel',
    'Ok, grant',
  ),
};
