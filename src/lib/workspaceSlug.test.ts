import { describe, expect, it } from 'vitest';
import { slugifyWorkspaceName, validateWorkspaceName } from './workspaceSlug';

describe('workspace slug generation', () => {
  it('creates a lowercase URL-safe slug from a workspace name', () => {
    expect(slugifyWorkspaceName('  Flôwboard & AI  ')).toBe('flowboard-ai');
  });

  it('collapses punctuation and whitespace into single hyphens', () => {
    expect(slugifyWorkspaceName('Roadmap--- 2026!')).toBe('roadmap-2026');
  });

  it('rejects blank, overlong, and non-sluggable names', () => {
    expect(validateWorkspaceName('  ')).toBe('Enter a workspace name.');
    expect(validateWorkspaceName('x'.repeat(101))).toContain('100 characters');
    expect(validateWorkspaceName('🚀')).toContain('letters or numbers');
    expect(validateWorkspaceName('Flowboard')).toBeNull();
  });
});
