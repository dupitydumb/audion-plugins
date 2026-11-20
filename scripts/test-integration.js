'use strict';

/**
 * End-to-end test of the build pipeline with GitHub stubbed out, so it runs
 * offline and without spending API quota.
 *
 *   node scripts/test-integration.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let failures = 0;
let passes = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            throw new Error('async test passed to sync test(); use testAsync');
        }
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

// Stub the GitHub layer BEFORE the build modules load, since manifest.js
// destructures fetchText at require time.
const github = require('./lib/github');

const repo = (fullName, extra = {}) => ({
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    default_branch: 'main',
    stargazers_count: 1,
    pushed_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    license: { spdx_id: 'MIT' },
    ...extra,
});

const manifestFor = (name, extra = {}) => ({
    name,
    version: '1.0.0',
    author: 'Tester',
    type: 'js',
    entry: 'index.js',
    permissions: ['player:read'],
    ...extra,
});

// manifest.js destructures fetchText at require time, so the stub must read
// mutable state rather than be reassigned between scenarios.
let scenario = { repos: [], manifests: {}, downloads: {}, failOn: [] };

const setScenario = (next) => {
    scenario = { repos: [], manifests: {}, downloads: {}, failOn: [], ...next };
};

github.searchTopicRepos = async () => scenario.repos;
github.getReleaseDownloads = async (fullName) => {
    if (scenario.failOn.includes(fullName)) throw new github.HttpError(403, `releases ${fullName}`);
    return scenario.downloads[fullName] ?? 0;
};
github.fetchText = async (_host, p) => {
    const fullName = p.split('/').slice(1, 3).join('/');
    const manifest = scenario.manifests[fullName];
    if (manifest === undefined) return null;
    if (typeof manifest === 'string') return manifest;
    return JSON.stringify(manifest);
};
github.fetchJson = async () => ({ status: 200, data: {} });
github.getRepo = async () => null;

const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'audion-integration-'));
process.env.AUDION_REGISTRY_OUTPUT = tmpOut;

const { buildRegistry } = require('./build-registry');

const registryPath = path.join(tmpOut, 'registry.json');
const readRegistry = () => JSON.parse(fs.readFileSync(registryPath, 'utf8'));

(async () => {
    console.log('\nfull build');

    setScenario({
        repos: [repo('alice/alpha'), repo('bob/beta'), repo('carol/gamma')],
        manifests: {
            'alice/alpha': manifestFor('Alpha'),
            'bob/beta': manifestFor('Beta'),
            'carol/gamma': manifestFor('Gamma'),
        },
    });

    const first = await buildRegistry();

    test('writes registry.json', () => {
        assert.ok(fs.existsSync(registryPath));
    });

    test('includes every valid plugin', () => {
        assert.strictEqual(first.plugins.length, 3);
        assert.deepStrictEqual(
            readRegistry().plugins.map((p) => p.manifest.name).sort(),
            ['Alpha', 'Beta', 'Gamma']
        );
    });

    test('output is sorted by repo URL', () => {
        const repos = readRegistry().plugins.map((p) => p.repo);
        assert.deepStrictEqual(repos, [...repos].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)));
    });

    test('records the build timestamp', () => {
        assert.ok(!Number.isNaN(Date.parse(readRegistry().updated_at)));
    });

    console.log('\nre-run with no changes');

    const before = fs.readFileSync(registryPath, 'utf8');
    const second = await buildRegistry();

    test('does not rewrite the file', () => {
        assert.strictEqual(second.written, false);
        assert.strictEqual(fs.readFileSync(registryPath, 'utf8'), before);
    });

    test('preserves the original updated_at', () => {
        assert.strictEqual(readRegistry().updated_at, JSON.parse(before).updated_at);
    });

    console.log('\nplugin changes');

    setScenario({
        repos: [repo('alice/alpha'), repo('bob/beta'), repo('carol/gamma')],
        manifests: {
            'alice/alpha': manifestFor('Alpha', { version: '2.0.0' }),
            'bob/beta': manifestFor('Beta'),
            'carol/gamma': manifestFor('Gamma'),
        },
    });

    const third = await buildRegistry();

    test('rewrites the file when a version bumps', () => {
        assert.strictEqual(third.written, true);
        assert.strictEqual(readRegistry().plugins.find((p) => p.manifest.name === 'Alpha').manifest.version, '2.0.0');
    });

    console.log('\ninvalid and blocked plugins');

    setScenario({
        repos: [
            repo('alice/alpha'),
            repo('bob/beta'),
            repo('carol/gamma'),
            repo('bad/nomanifest'),
            repo('bad/broken'),
            repo('evil/spam'),
        ],
        manifests: {
            'alice/alpha': manifestFor('Alpha', { version: '2.0.0' }),
            'bob/beta': manifestFor('Beta'),
            'carol/gamma': manifestFor('Gamma'),
            'bad/broken': '{not json',
            'evil/spam': manifestFor('Test Plugin. DO NOT INSTALL', { author: 'Spammer' }),
        },
    });

    const fourth = await buildRegistry();

    test('skips a repo without plugin.json', () => {
        assert.ok(!fourth.plugins.some((p) => p.repo.includes('nomanifest')));
    });

    test('skips a repo with invalid JSON', () => {
        assert.ok(!fourth.plugins.some((p) => p.repo.includes('broken')));
    });

    test('skips a blocked plugin', () => {
        assert.ok(!fourth.plugins.some((p) => p.repo.includes('evil/spam')));
    });

    console.log('\ncuration survives a rebuild');

    const curatedPath = path.join(__dirname, '..', 'curated.json');
    const originalCurated = fs.readFileSync(curatedPath, 'utf8');

    try {
        const curated = JSON.parse(originalCurated);
        curated.plugins['https://github.com/alice/alpha'] = {
            curated: true,
            verified: true,
            featured: true,
            description: 'Curated description',
        };
        fs.writeFileSync(curatedPath, JSON.stringify(curated, null, 2));

        setScenario({
            repos: [repo('alice/alpha'), repo('bob/beta'), repo('carol/gamma')],
            manifests: {
                'alice/alpha': manifestFor('Alpha', { version: '2.0.0' }),
                'bob/beta': manifestFor('Beta'),
                'carol/gamma': manifestFor('Gamma'),
            },
        });

        const fifth = await buildRegistry();
        const alpha = fifth.plugins.find((p) => p.manifest.name === 'Alpha');

        test('applies curated flags from curated.json', () => {
            assert.strictEqual(alpha.curated, true);
            assert.strictEqual(alpha.verified, true);
            assert.strictEqual(alpha.featured, true);
        });

        test('applies curated overrides', () => {
            assert.strictEqual(alpha.manifest.description, 'Curated description');
        });

        test('puts the featured plugin first', () => {
            assert.strictEqual(fifth.plugins[0].manifest.name, 'Alpha');
        });

        await testAsync('re-running keeps curation (does not churn)', async () => {
            const snapshot = fs.readFileSync(registryPath, 'utf8');
            const result = await buildRegistry();
            assert.strictEqual(result.written, false);
            assert.strictEqual(fs.readFileSync(registryPath, 'utf8'), snapshot);
        });
    } finally {
        fs.writeFileSync(curatedPath, originalCurated);
    }
    console.log('\nstats failures are not fatal');

    setScenario({
        repos: [repo('alice/alpha'), repo('bob/beta'), repo('carol/gamma')],
        manifests: {
            'alice/alpha': manifestFor('Alpha', { version: '2.0.0' }),
            'bob/beta': manifestFor('Beta'),
            'carol/gamma': manifestFor('Gamma'),
        },
        failOn: ['bob/beta'],
    });

    const sixth = await buildRegistry();

    test('publishes the plugin even when its release stats fail', () => {
        assert.ok(sixth.plugins.some((p) => p.repo.includes('bob/beta')));
    });

    test('keeps the previous download count on stats failure', () => {
        const beta = sixth.plugins.find((p) => p.repo.includes('bob/beta'));
        assert.strictEqual(typeof beta.downloads, 'number');
    });

    console.log('\nsafety guard');

    setScenario({
        repos: [repo('alice/alpha')],
        manifests: { 'alice/alpha': manifestFor('Alpha', { version: '2.0.0' }) },
    });

    let aborted = false;
    const originalExit = process.exit;
    const originalError = console.error;
    process.exit = () => {
        aborted = true;
        throw new Error('__exit__');
    };
    console.error = () => {};

    try {
        await buildRegistry();
    } catch (err) {
        if (err.message !== '__exit__') throw err;
    } finally {
        process.exit = originalExit;
        console.error = originalError;
    }

    test('refuses to publish when plugins mass-disappear', () => {
        assert.strictEqual(aborted, true);
    });

    test('leaves the previous registry intact after aborting', () => {
        const onDisk = readRegistry();
        assert.ok(onDisk.plugins.length >= 3, 'previous registry should not be overwritten');
    });

    fs.rmSync(tmpOut, { recursive: true, force: true });

    console.log(`\n${passes} passed, ${failures} failed\n`);
    process.exit(failures === 0 ? 0 : 1);
})();
