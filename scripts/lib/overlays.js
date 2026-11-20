'use strict';

/**
 * Hand-maintained overlays.
 *
 * The registry is rebuilt from scratch on every run, which used to wipe any
 * manual curation. These files are the source of truth for decisions a human
 * made, and are merged in during the build:
 *
 *   curated.json  — flags and overrides for specific plugins
 *   blocked.json  — repos, authors or plugin names that must never be listed
 *
 * Matching is done on normalised repo URLs (case-insensitive, no trailing
 * slash, no ".git"), so a maintainer does not have to copy URLs exactly.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const CURATED_PATH = path.join(ROOT, 'curated.json');
const BLOCKED_PATH = path.join(ROOT, 'blocked.json');

const CURATED_OVERRIDE_FIELDS = ['name', 'description', 'category', 'tags', 'homepage', 'icon'];

function normaliseRepo(url) {
    if (typeof url !== 'string') return '';
    return url
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '');
}

function readJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (raw === '') return fallback;

    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`${path.basename(filePath)} is not valid JSON: ${err.message}`);
    }
}

function loadCurated() {
    const data = readJson(CURATED_PATH, { plugins: {} });
    const entries = data.plugins || {};
    const byRepo = new Map();

    for (const [repo, entry] of Object.entries(entries)) {
        if (repo.startsWith('_')) continue; // allow "_comment" style keys
        byRepo.set(normaliseRepo(repo), entry || {});
    }

    return byRepo;
}

function loadBlocked() {
    const data = readJson(BLOCKED_PATH, {});
    const normaliseList = (value) =>
        Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim() !== '') : [];

    return {
        repos: new Set(normaliseList(data.repos).map(normaliseRepo)),
        authors: new Set(normaliseList(data.authors).map((a) => a.trim().toLowerCase())),
        names: new Set(normaliseList(data.names).map((n) => n.trim().toLowerCase())),
    };
}

function isBlocked(blocked, { repoUrl, author, name }) {
    if (blocked.repos.has(normaliseRepo(repoUrl))) return true;
    if (author && blocked.authors.has(String(author).trim().toLowerCase())) return true;
    if (name && blocked.names.has(String(name).trim().toLowerCase())) return true;
    return false;
}

/**
 * Merge a curation entry into a built plugin entry. Returns the entry, or null
 * when the maintainer has hidden it.
 */
function applyCuration(entry, curation) {
    if (!curation) {
        return { ...entry, curated: false, verified: false };
    }

    if (curation.hidden === true) return null;

    const merged = {
        ...entry,
        curated: curation.curated === true,
        verified: curation.verified === true,
    };

    if (curation.featured === true) merged.featured = true;
    if (typeof curation.note === 'string') merged.note = curation.note;

    for (const field of CURATED_OVERRIDE_FIELDS) {
        if (curation[field] !== undefined) {
            merged.manifest = { ...merged.manifest, [field]: curation[field] };
        }
    }

    return merged;
}

module.exports = {
    CURATED_PATH,
    BLOCKED_PATH,
    normaliseRepo,
    readJson,
    loadCurated,
    loadBlocked,
    isBlocked,
    applyCuration,
};
