interface DefaultWorkspace {
  id: string;
  name: string;
  // The rest will be filled by the workspace/workspacesById getter
}

export default (): { [id: string]: DefaultWorkspace } => ({
  main: {
    id: 'main',
    name: 'Main workspace',
    // The rest will be filled by the workspace/workspacesById getter
  },
});
