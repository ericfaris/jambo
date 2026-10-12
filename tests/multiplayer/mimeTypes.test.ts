import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { contentTypeFor } from '../../src/multiplayer/mimeTypes.ts';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('static content types', () => {
  it('serves the web app manifest as a manifest, so browsers install it', () => {
    expect(contentTypeFor('.webmanifest')).toBe('application/manifest+json');
  });

  it('knows every file type shipped in public/', () => {
    const unknown = walk('public').map((p) => extname(p).toLowerCase()).filter((ext) => contentTypeFor(ext) === 'application/octet-stream');
    expect([...new Set(unknown)]).toEqual([]);
  });
});
