'use strict';

/**
 * Offline tests for the registry build. Stubs the GitHub layer so the logic can
 * be exercised without spending API quota.
 *
 *   node scripts/test-build.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audion-registry-test-'));

let failures = 0;
let passes = 0;

function test(name, fn) {
    try {
        fn();
        passes++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failures++;
        console.error(`  ✖ ${name}\n      ${err.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        passes++;
        console.log(`  ✓ ${name}`);
    } catch (err) {
        failures++;
        console.error(`  ✖ ${name}\n      ${err.message}`);
    }
}

console.log('\nmanifest validation');

const manifestLib = require('./lib/manifest');

const validManifest = {
    name: 'Demo',
    version: '1.0.0',
    author: 'Someone',
    type: 'js',
    entry: 'index.js',
    permissions: ['player:read'],
};

test('accepts a well-formed manifest', () => {
    const result = manifestLib.validateManifest(validManifest);
    assert.strictEqual(result.ok, true, result.errors.join('; '));
    assert.strictEqual(result.warnings.length, 0);
});

test('rejects a missing required field', () => {
    const result = manifestLib.validateManifest({ ...validManifest, name: undefined });
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('name')));
});

test('rejects an unknown plugin type', () => {
    const result = manifestLib.validateManifest({ ...validManifest, type: 'python' });
    assert.strictEqual(result.ok, false);
});

test('rejects non-array permissions', () => {
    const result = manifestLib.validateManifest({ ...validManifest, permissions: 'player:read' });
    assert.strictEqual(result.ok, false);
});

test('rejects a path-traversal entry', () => {
    const result = manifestLib.validateManifest({ ...validManifest, entry: '../../etc/passwd' });
    assert.strictEqual(result.ok, false);
});

test('rejects an absolute entry path', () => {
    const result = manifestLib.validateManifest({ ...validManifest, entry: '/etc/passwd' });
    assert.strictEqual(result.ok, false);
});

test('rejects an entry with a URL scheme', () => {
    const result = manifestLib.validateManifest({ ...validManifest, entry: 'https://evil.example/x.js' });
    assert.strictEqual(result.ok, false);
});

test('warns, but accepts, a non-semver version', () => {
    const result = manifestLib.validateManifest({ ...validManifest, version: 'v1' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes('semver')));
});

test('warns, but accepts, an undocumented permission', () => {
    const result = manifestLib.validateManifest({ ...validManifest, permissions: ['player:read', 'fs:delete'] });
    assert.strictEqual(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes('fs:delete')));
});

test('rejects null, arrays and strings as manifests', () => {
    for (const bad of [null, [], 'nope', 42]) {
        assert.strictEqual(manifestLib.validateManifest(bad).ok, false, `should reject ${JSON.stringify(bad)}`);
    }
});

console.log('\noverlays');

const overlays = require('./lib/overlays');

test('normalises repo URLs for matching', () => {
    const forms = [
        'https://github.com/Foo/Bar',
        'http://github.com/foo/bar/',
        'https://www.github.com/FOO/BAR.git',
        'github.com/foo/bar',
    ];
    const normalised = new Set(forms.map(overlays.normaliseRepo));
    assert.strictEqual(normalised.size, 1, [...normalised].join(' | '));
});

test('blocklist matches on repo, author and name', () => {
    const blocked = {
        repos: new Set([overlays.normaliseRepo('https://github.com/a/b')]),
        authors: new Set(['spammer']),
        names: new Set(['test plugin']),
    };

    assert.strictEqual(overlays.isBlocked(blocked, { repoUrl: 'https://github.com/A/B.git' }), true);
    assert.strictEqual(overlays.isBlocked(blocked, { repoUrl: 'https://github.com/x/y', author: 'Spammer' }), true);
    assert.strictEqual(overlays.isBlocked(blocked, { repoUrl: 'https://github.com/x/y', name: 'Test Plugin' }), true);
    assert.strictEqual(overlays.isBlocked(blocked, { repoUrl: 'https://github.com/x/y', author: 'ok', name: 'fine' }), false);
});

test('curation flags and overrides are applied', () => {
    const entry = { manifest: { name: 'A', description: 'old', category: 'utility' }, repo: 'r' };
    const merged = overlays.applyCuration(entry, {
        curated: true,
        verified: true,
        featured: true,
        description: 'new',
        category: 'audio',
    });

    assert.strictEqual(merged.curated, true);
    assert.strictEqual(merged.verified, true);
    assert.strictEqual(merged.featured, true);
    assert.strictEqual(merged.manifest.description, 'new');
    assert.strictEqual(merged.manifest.category, 'audio');
    assert.strictEqual(merged.manifest.name, 'A', 'name should be untouched when not overridden');
});

test('hidden curation removes the plugin', () => {
    const merged = overlays.applyCuration({ manifest: {}, repo: 'r' }, { hidden: true });
    assert.strictEqual(merged, null);
});

test('no curation yields uncurated defaults', () => {
    const merged = overlays.applyCuration({ manifest: {}, repo: 'r' }, undefined);
    assert.strictEqual(merged.curated, false);
    assert.strictEqual(merged.verified, false);
});

console.log('\nrepository overlays');

const realCurated = overlays.readJson(overlays.CURATED_PATH, { plugins: {} });
const realBlocked = overlays.readJson(overlays.BLOCKED_PATH, {});

test('curated.json parses and is an object', () => {
    assert.ok(realCurated && typeof realCurated === 'object');
    assert.ok(realCurated.plugins && typeof realCurated.plugins === 'object');
});

test('blocked.json parses and lists arrays', () => {
    for (const key of ['repos', 'authors', 'names']) {
        assert.ok(Array.isArray(realBlocked[key]), `${key} must be an array`);
    }
});

test('every curated entry uses a known key', () => {
    const allowed = new Set([
        'curated', 'verified', 'featured', 'hidden', 'note',
        'name', 'description', 'category', 'tags', 'homepage', 'icon',
    ]);
    for (const [repo, entry] of Object.entries(realCurated.plugins || {})) {
        for (const key of Object.keys(entry)) {
            assert.ok(allowed.has(key), `${repo} has unknown key "${key}"`);
        }
    }
});

console.log('\nsafety guards');

const guards = require('./lib/guards');

const makePrevious = (count) => ({
    plugins: Array.from({ length: count }, (_, i) => ({
        repo: `https://github.com/o/r${i}`,
        manifest: { name: `P${i}`, author: 'o' },
    })),
});

const noCuration = new Map();
const noBlocking = { repos: new Set(), authors: new Set(), names: new Set() };

test('allows a build that keeps every plugin', () => {
    const previous = makePrevious(10);
    const result = guards.checkGuards(previous, previous.plugins, noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, true);
});

test('allows a build that adds plugins', () => {
    const previous = makePrevious(3);
    const next = [...previous.plugins, { repo: 'https://github.com/o/new', manifest: { name: 'N' } }];
    const result = guards.checkGuards(previous, next, noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, true);
});

test('trips when zero plugins are produced', () => {
    const result = guards.checkGuards(makePrevious(10), [], noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, false);
    assert.ok(result.problems.some((p) => p.includes('zero plugins')));
});

test('trips when more than 20% of plugins vanish', () => {
    const previous = makePrevious(10);
    const result = guards.checkGuards(previous, previous.plugins.slice(0, 7), noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, false, '3 of 10 missing should trip the guard');
});

test('allows a removal at exactly the limit', () => {
    const previous = makePrevious(10);
    const result = guards.checkGuards(previous, previous.plugins.slice(0, 8), noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, true, '2 of 10 missing is within budget');
});

test('does not count a blocked plugin against the loss budget', () => {
    const previous = makePrevious(10);
    const blocked = {
        repos: new Set([overlays.normaliseRepo('https://github.com/o/r0')]),
        authors: new Set(),
        names: new Set(),
    };
    const next = previous.plugins.filter((p) => p.repo !== 'https://github.com/o/r0');
    const result = guards.checkGuards(previous, next, noCuration, blocked, overlays);
    assert.strictEqual(result.ok, true);
});

test('does not count a hidden plugin against the loss budget', () => {
    const previous = makePrevious(10);
    const curated = new Map([[overlays.normaliseRepo('https://github.com/o/r0'), { hidden: true }]]);
    const next = previous.plugins.filter((p) => p.repo !== 'https://github.com/o/r0');
    const result = guards.checkGuards(previous, next, curated, noBlocking, overlays);
    assert.strictEqual(result.ok, true);
});

test('passes when there is no previous registry', () => {
    const result = guards.checkGuards(null, [], noCuration, noBlocking, overlays);
    assert.strictEqual(result.ok, true);
});

console.log('\nregistry output');

test('sort order is deterministic and featured-first', () => {
    // Mirrors sortPlugins in build-registry.js.
    const sortPlugins = (plugins) =>
        [...plugins].sort((a, b) => {
            const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
            if (featured !== 0) return featured;
            return a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : 1;
        });

    const input = [
        { repo: 'https://github.com/z/z' },
        { repo: 'https://github.com/A/a' },
        { repo: 'https://github.com/m/m', featured: true },
    ];
    const once = sortPlugins(input).map((p) => p.repo);
    const twice = sortPlugins([...input].reverse()).map((p) => p.repo);

    assert.deepStrictEqual(once, twice, 'order must not depend on input order');
    assert.strictEqual(once[0], 'https://github.com/m/m', 'featured plugin should lead');
});

console.log('\nlive registry');

const registryPath = path.join(ROOT, 'registry', 'main', 'registry.json');
if (fs.existsSync(registryPath)) {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

    test('registry parses and has plugins', () => {
        assert.ok(Array.isArray(registry.plugins));
        assert.ok(registry.plugins.length > 0);
    });

    test('no duplicate repos', () => {
        const repos = registry.plugins.map((p) => overlays.normaliseRepo(p.repo));
        assert.strictEqual(new Set(repos).size, repos.length);
    });

    test('every entry has the fields the app reads', () => {
        for (const plugin of registry.plugins) {
            for (const field of ['manifest', 'repo', 'manifest_url', 'curated', 'verified']) {
                assert.ok(field in plugin, `${plugin.repo} missing ${field}`);
            }
            for (const field of ['name', 'version', 'author', 'type', 'entry', 'permissions', 'category']) {
                assert.ok(field in plugin.manifest, `${plugin.repo} manifest missing ${field}`);
            }
        }
    });

    test('blocked repos do not appear', () => {
        const blocked = overlays.loadBlocked();
        for (const plugin of registry.plugins) {
            assert.strictEqual(
                overlays.isBlocked(blocked, {
                    repoUrl: plugin.repo,
                    author: plugin.manifest.author,
                    name: plugin.manifest.name,
                }),
                false,
                `${plugin.repo} is blocked but present`
            );
        }
    });

    test('categories are all documented', () => {
        for (const plugin of registry.plugins) {
            assert.ok(
                manifestLib.VALID_CATEGORIES.includes(plugin.manifest.category),
                `${plugin.repo} has category "${plugin.manifest.category}"`
            );
        }
    });

    test('plugins are sorted deterministically', () => {
        const sorted = [...registry.plugins].sort((a, b) => {
            const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
            if (featured !== 0) return featured;
            return a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : 1;
        });
        assert.deepStrictEqual(
            registry.plugins.map((p) => p.repo),
            sorted.map((p) => p.repo)
        );
    });
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures === 0 ? 0 : 1);
