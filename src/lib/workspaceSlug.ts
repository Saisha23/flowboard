export function slugifyWorkspaceName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateWorkspaceName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a workspace name.';
  if (trimmed.length > 100) return 'Workspace names must be 100 characters or fewer.';
  if (!slugifyWorkspaceName(trimmed)) return 'Use letters or numbers so a workspace URL can be created.';
  return null;
}
