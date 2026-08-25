import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const APP_DIR = join(__dirname, '..', 'app');
const SRC_DIR = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function toRoutePath(file: string): string | null {
  const rel = relative(APP_DIR, file).replace(/\.tsx?$/, '');
  const segments = rel.split(sep);

  const last = segments[segments.length - 1] ?? '';
  if (last.startsWith('_') || last.startsWith('+')) return null;

  const path = segments
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter((segment) => segment !== 'index')
    .join('/');

  return `/${path}`;
}

const routes = new Set(
  walk(APP_DIR)
    .filter((file) => file.endsWith('.tsx'))
    .map(toRoutePath)
    .filter((path): path is string => path !== null),
);

function collectHrefs(): { file: string; href: string }[] {
  const found: { file: string; href: string }[] = [];
  const pattern =
    /(?:router\.(?:push|replace|navigate)\(\s*['"]|href=\{?['"]|pathname:\s*['"])(\/[a-zA-Z0-9\-_/]*)['"]/g;

  for (const file of walk(SRC_DIR)) {
    if (!file.endsWith('.tsx') && !file.endsWith('.ts')) continue;
    if (file.includes('__tests__')) continue;

    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
      const href = match[1];
      if (href) found.push({ file: relative(SRC_DIR, file), href });
    }
  }
  return found;
}

function routeExists(href: string): boolean {
  if (href === '/') return true;
  if (routes.has(href)) return true;
  return [...routes].some((route) => {
    const routeParts = route.split('/');
    const hrefParts = href.split('/');
    if (routeParts.length !== hrefParts.length) return false;
    return routeParts.every(
      (part, i) => (part.startsWith('[') && part.endsWith(']')) || part === hrefParts[i],
    );
  });
}

describe('route targets', () => {
  it('discovers the app routes', () => {
    expect(routes.size).toBeGreaterThan(5);
    expect(routes.has('/home')).toBe(true);
    expect(routes.has('/welcome')).toBe(true);
  });

  it('serves onboarding under /onboarding, not at the root', () => {
    expect(routes.has('/onboarding/name')).toBe(true);
    expect(routes.has('/name')).toBe(false);
  });

  it('every literal href the code navigates to resolves to a real route', () => {
    const broken = collectHrefs().filter(({ href }) => !routeExists(href));

    expect(broken.map(({ file, href }) => `${file} -> ${href}`)).toEqual([]);
  });
});
