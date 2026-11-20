#!/usr/bin/env node
'use strict';

/**
 * Build Registry
 *
 * Discovers GitHub repos carrying the `audion-plugins` topic, validates their
 * plugin.json, and writes registry/main/registry.json.
 *
 * Curation and blocking live in curated.json / blocked.json and are merged in
 * here, so a rebuild can never erase a maintainer's decisions.
 *
 * Modes:
 *   (default)   full discovery + build
 *   --validate  validate the overlay files and exit
 *   --dry-run   build and report, write nothing
 *   --force     publish even if the safety guards would abort
 */

const fs = require('fs');
const path = require('path');

const github = require('./lib/github');
const manifestLib = require('./lib/manifest');
const overlays = require('./lib/overlays');
const guards = require('./lib/guards');

const TOPIC = 'audion-plugins';
const OUTPUT_DIR = process.env.AUDION_REGISTRY_OUTPUT
    ? path.resolve(process.env.AUDION_REGISTRY_OUTPUT)
    : path.join(__dirname, '..', 'registry', 'main');
const REGISTRY_PATH = path.join(OUTPUT_DIR, 'registry.json');

const args = new Set(process.argv.slice(2));
const MODE = {
    validate: args.has('--validate'),
    dryRun: args.has('--dry-run'),
    force: args.has('--force'),
};

const token = process.env.GITHUB_TOKEN || undefined;

const log = (...parts) => console.log(...parts);
const warn = (...parts) => console.warn(...parts);

function fail(message) {
    console.error(`\n✖ ${message}`);
    process.exit(1);
}

function readJsonIfExists(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`${path.basename(filePath)} exists but is not valid JSON: ${err.message}`);
    }
}

function writeJsonIfChanged(filePath, value) {
    const next = `${JSON.stringify(value, null, 2)}\n`;
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;

    if (current !== null) {
        try {
            if (JSON.stringify(JSON.parse(current)) === JSON.stringify(value)) return false;
        } catch {
            // Unparseable existing file: fall through and overwrite it.
        }
    }

    if (MODE.dryRun) {
        log(`   [dry-run] would write ${path.relative(process.cwd(), filePath)}`);
        return true;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, next);
    return true;
}

/** Ignore the build timestamp when deciding whether anything really changed. */
function sameCatalog(a, b) {
    return JSON.stringify({ ...a, updated_at: null }) === JSON.stringify({ ...b, updated_at: null });
}

function sortPlugins(plugins) {
    // Deterministic order: featured first, then by repo URL. Search results are
    // star-ranked and reshuffle constantly, which used to rewrite the file.
    return [...plugins].sort((a, b) => {
        const featured = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
        if (featured !== 0) return featured;
        return a.repo.toLowerCase() < b.repo.toLowerCase() ? -1 : 1;
    });
}

function buildManifest(manifest, repo) {
    const manifestUrl = `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/plugin.json`;
    const category = manifestLib.VALID_CATEGORIES.includes(manifest.category)
        ? manifest.category
        : manifestLib.DEFAULT_CATEGORY;

    return {
        name: manifest.name,
        version: manifest.version,
        author: manifest.author,
        description: manifest.description || '',
        repo: repo.html_url,
        manifest_url: manifestUrl,
        type: manifest.type,
        entry: manifest.entry,
        permissions: manifest.permissions,
        ui_slots: manifest.ui_slots ?? null,
        icon: manifest.icon ?? null,
        homepage: manifest.homepage || repo.html_url,
        category,
        tags: Array.isArray(manifest.tags) ? manifest.tags : [],
        min_version: manifest.min_version ?? null,
        license: manifest.license || repo.license?.spdx_id || null,
    };
}

function checkGuards(previous, plugins, curated, blocked) {
    if (MODE.force) {
        warn('   ! --force given, skipping safety guards');
        return;
    }

    const result = guards.checkGuards(previous, plugins, curated, blocked, overlays);
    if (result.ok) return;

    for (const repoUrl of result.missing.slice(0, 10)) warn(`   - missing: ${repoUrl}`);
    if (result.missing.length > 10) warn(`   - ...and ${result.missing.length - 10} more`);

    fail(
        `Safety guard tripped: ${result.problems.join('; ')}.\n` +
            `   This usually means a GitHub API problem, not real plugin removals.\n` +
            `   Re-run with --force if the removals are intentional.`
    );
}

async function buildRegistry() {
    const previous = readJsonIfExists(REGISTRY_PATH);
    const curated = overlays.loadCurated();
    const blocked = overlays.loadBlocked();

    log(`Searching GitHub for repos with topic: ${TOPIC}`);
    const repos = await github.searchTopicRepos({ topic: TOPIC, token });
    log(`Found ${repos.length} repos\n`);

    const plugins = [];

    for (const repo of repos) {
        log(`Checking: ${repo.full_name}`);

        // A transport failure here must abort the run. Swallowing it is how a
        // rate-limit storm used to publish a registry with plugins missing.
        const { manifest, reason } = await manifestLib.fetchManifest(repo);

        if (!manifest) {
            log(`  – skipped: ${reason}`);
            continue;
        }

        const validation = manifestLib.validateManifest(manifest);

        for (const warning of validation.warnings) {
            warn(`  ! ${manifest.name || repo.full_name}: ${warning}`);
        }

        if (!validation.ok) {
            log(`  ✖ invalid manifest: ${validation.errors.join('; ')}`);
            continue;
        }

        if (
            overlays.isBlocked(blocked, {
                repoUrl: repo.html_url,
                author: manifest.author,
                name: manifest.name,
            })
        ) {
            log(`  – blocked by blocked.json`);
            continue;
        }

        log(`  ✓ ${manifest.name}@${manifest.version}`);

        // Stats are advisory. A failure here degrades the numbers, not the
        // catalog, so fall back to the previous value rather than aborting.
        const previousEntry = previous?.plugins?.find((p) => p.repo === repo.html_url);
        const downloads = await github
            .getReleaseDownloads(repo.full_name, { token })
            .catch((err) => {
                warn(`  ! download stats unavailable: ${err.message}`);
                return previousEntry?.downloads ?? 0;
            });

        const entry = {
            manifest: buildManifest(manifest, repo),
            curated: false,
            verified: false,
            repo: repo.html_url,
            manifest_url: `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/plugin.json`,
            stars: repo.stargazers_count || 0,
            downloads,
            lastUpdated: repo.pushed_at || repo.updated_at || null,
        };

        const merged = overlays.applyCuration(entry, curated.get(overlays.normaliseRepo(repo.html_url)));

        if (merged === null) {
            log(`  – hidden by curated.json`);
            continue;
        }

        plugins.push(merged);
    }

    checkGuards(previous, plugins, curated, blocked);

    const sorted = sortPlugins(plugins);
    const next = {
        version: previous?.version || '1.0.0',
        updated_at: new Date().toISOString(),
        plugins: sorted,
    };

    // Keep the previous timestamp when nothing meaningful changed, so the file
    // does not churn just because the job ran.
    const unchanged = previous && sameCatalog(previous, next);
    if (unchanged) next.updated_at = previous.updated_at;

    const written = writeJsonIfChanged(REGISTRY_PATH, next);

    log(
        written
            ? `\n✓ ${sorted.length} plugins — registry.json updated`
            : `\n✓ ${sorted.length} plugins — no changes`
    );

    return { plugins: sorted, written };
}

function validate() {
    const curated = overlays.loadCurated();
    const blocked = overlays.loadBlocked();

    log(`curated.json: ${curated.size} entries`);
    log(`blocked.json: ${blocked.repos.size} repos, ${blocked.authors.size} authors, ${blocked.names.size} names`);

    const registry = readJsonIfExists(REGISTRY_PATH);
    if (registry) {
        const plugins = Array.isArray(registry.plugins) ? registry.plugins : [];
        log(`registry.json: ${plugins.length} plugins`);

        if (!Array.isArray(registry.plugins)) fail('registry.json has no plugins array');

        const duplicates = plugins
            .map((p) => overlays.normaliseRepo(p.repo))
            .filter((repo, i, all) => all.indexOf(repo) !== i);

        if (duplicates.length > 0) fail(`duplicate plugins in registry.json: ${duplicates.join(', ')}`);
    }

    log('\n✓ overlays are valid');
}

async function main() {
    if (MODE.validate) return validate();
    return buildRegistry();
}

module.exports = {
    buildRegistry,
    sortPlugins,
    buildManifest,
    sameCatalog,
    REGISTRY_PATH,
};

if (require.main === module) {
    main().catch((err) => {
        console.error(`\n✖ Failed: ${err.message}`);
        if (err.stack && process.env.DEBUG) console.error(err.stack);
        process.exit(1);
    });
}
