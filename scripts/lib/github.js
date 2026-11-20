'use strict';

/**
 * Minimal GitHub HTTP client.
 *
 * Every request is retried with exponential backoff on network errors and on
 * the status codes GitHub uses for throttling or transient outages. Rate-limit
 * resets are honoured when the server tells us how long to wait. Anything we
 * cannot recover from throws an HttpError so the caller can abort the build
 * instead of silently publishing a partial registry.
 */

const https = require('https');

const GITHUB_API = 'api.github.com';
const USER_AGENT = 'Audion-Registry-Builder';
const MAX_ATTEMPTS = 4;
const MAX_WAIT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504]);

class HttpError extends Error {
    constructor(status, url, headers = {}) {
        super(`HTTP ${status} for ${url}`);
        this.name = 'HttpError';
        this.status = status;
        this.url = url;
        this.headers = headers;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rawRequest({ hostname, path, headers }) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname,
                path,
                method: 'GET',
                headers: { 'User-Agent': USER_AGENT, ...headers },
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8'),
                    })
                );
            }
        );

        req.on('error', reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms: ${hostname}${path}`));
        });
        req.end();
    });
}

/**
 * How long to wait before retrying, or null when waiting would exceed our
 * budget (in which case the caller should treat it as a hard failure).
 */
function retryWaitMs(headers) {
    const retryAfter = Number(headers['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const wait = retryAfter * 1000;
        return wait <= MAX_WAIT_MS ? wait : null;
    }

    if (headers['x-ratelimit-remaining'] === '0') {
        const reset = Number(headers['x-ratelimit-reset']);
        if (Number.isFinite(reset)) {
            const wait = reset * 1000 - Date.now() + 1000;
            return wait <= MAX_WAIT_MS ? Math.max(wait, 1000) : null;
        }
    }

    return 1000;
}

/**
 * GET a URL and return { status, body }. 404 is returned to the caller rather
 * than thrown, because "this plugin has no manifest" is a normal outcome.
 * Transport failures and unrecoverable statuses throw.
 */
async function get(hostname, path, { headers = {}, token } = {}) {
    const url = `https://${hostname}${path}`;
    const auth = token ? { Authorization: `Bearer ${token}` } : {};
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let res;
        try {
            res = await rawRequest({ hostname, path, headers: { ...headers, ...auth } });
        } catch (err) {
            lastError = err;
            if (attempt === MAX_ATTEMPTS) throw err;
            await sleep(1000 * 2 ** (attempt - 1));
            continue;
        }

        if (res.status === 200) return res;
        if (res.status === 404) return res;

        if (!RETRY_STATUSES.has(res.status)) {
            throw new HttpError(res.status, url, res.headers);
        }

        const wait = retryWaitMs(res.headers);
        if (wait === null || attempt === MAX_ATTEMPTS) {
            throw new HttpError(res.status, url, res.headers);
        }

        console.warn(`  retrying ${res.status} from ${url} in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
    }

    throw lastError || new Error(`Request failed: ${url}`);
}

async function fetchJson(hostname, path, { token, accept = 'application/vnd.github+json' } = {}) {
    const res = await get(hostname, path, { headers: { Accept: accept }, token });
    if (res.status !== 200) return { status: res.status, data: null };

    try {
        return { status: 200, data: JSON.parse(res.body) };
    } catch {
        throw new Error(`Invalid JSON from https://${hostname}${path}`);
    }
}

async function fetchText(hostname, path) {
    const res = await get(hostname, path, { headers: { Accept: 'text/plain' } });
    return res.status === 200 ? res.body : null;
}

/**
 * Every repo carrying the topic, following pagination. Previously this read a
 * single page of 100 and silently truncated the marketplace past that size.
 */
async function searchTopicRepos({ topic, token }) {
    const repos = [];
    const perPage = 100;
    const maxPages = 10;

    for (let page = 1; page <= maxPages; page++) {
        const { status, data } = await fetchJson(
            GITHUB_API,
            `/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=${perPage}&page=${page}`,
            { token }
        );

        if (status !== 200 || !data) {
            throw new HttpError(status, `search page ${page}`);
        }

        const items = data.items || [];
        repos.push(...items);

        if (items.length < perPage || repos.length >= (data.total_count || 0)) break;
    }

    return repos;
}

async function getRepo(fullName, { token } = {}) {
    const { status, data } = await fetchJson(GITHUB_API, `/repos/${fullName}`, { token });
    return status === 200 ? data : null;
}

/**
 * Sum of download counts across all release assets. Older versions assumed
 * every release had an assets array and crashed when one did not.
 */
async function getReleaseDownloads(fullName, { token } = {}) {
    let total = 0;

    for (let page = 1; page <= 3; page++) {
        const { status, data } = await fetchJson(
            GITHUB_API,
            `/repos/${fullName}/releases?per_page=100&page=${page}`,
            { token }
        );

        if (status !== 200 || !Array.isArray(data)) break;

        for (const release of data) {
            for (const asset of release.assets || []) {
                total += asset.download_count || 0;
            }
        }

        if (data.length < 100) break;
    }

    return total;
}

module.exports = {
    GITHUB_API,
    HttpError,
    fetchJson,
    fetchText,
    searchTopicRepos,
    getRepo,
    getReleaseDownloads,
};
