import { getContextSafe } from './utils.js';

const REPOSITORY_URL = 'https://github.com/AnNastyLoneGirl/NastyTavern-UI';
const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/manifest.json';
const REMOTE_CHANGELOG_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/CHANGELOG.md';
const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/CHANGELOG.md`;
const LOCAL_MANIFEST_URL = new URL('../manifest.json', import.meta.url).href;
const LOCAL_CHANGELOG_URL = new URL('../CHANGELOG.md', import.meta.url).href;
const CACHE_KEY = 'nt:update-check:v2';
const CACHE_TTL = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 7000;
const UPDATE_TIMEOUT = 60 * 1000;

const cleanVersion = value => String(value ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/, 1)[0];

const versionParts = value => cleanVersion(value)
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => Number.isFinite(part) ? part : 0)
    .slice(0, 3);

export const compareVersions = (left, right) => {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < 3; index += 1) {
        const diff = (a[index] || 0) - (b[index] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
};

const stripInlineMarkdown = value => String(value ?? '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();

const fetchWithTimeout = async (url, options = {}, timeout = REQUEST_TIMEOUT) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
};

const fetchJson = async url => {
    const response = await fetchWithTimeout(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Update manifest request failed (${response.status})`);
    return await response.json();
};

const fetchText = async (url, { remote = false } = {}) => {
    const response = await fetchWithTimeout(url, remote ? { cache: 'no-store' } : {});
    if (!response.ok) throw new Error(`Update changelog request failed (${response.status})`);
    return await response.text();
};

const parseChangelog = (markdown, predicate) => {
    const entries = [];
    let version = '';
    let category = '';
    let include = false;

    for (const rawLine of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
        const versionMatch = rawLine.match(/^##\s+v?(\d+(?:\.\d+){1,2}(?:[-+][^\s]+)?)\s*$/i);
        if (versionMatch) {
            version = cleanVersion(versionMatch[1]);
            category = '';
            include = Boolean(predicate?.(version));
            continue;
        }

        const categoryMatch = rawLine.match(/^###\s+(.+?)\s*$/);
        if (categoryMatch) {
            category = stripInlineMarkdown(categoryMatch[1]);
            continue;
        }

        if (!include) continue;
        const bulletMatch = rawLine.match(/^\s*-\s+(.+?)\s*$/);
        if (!bulletMatch) continue;
        const text = stripInlineMarkdown(bulletMatch[1]);
        if (!text) continue;
        entries.push({ version, category, text });
    }

    return entries;
};

const readCache = localVersion => {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (!parsed || parsed.localVersion !== localVersion) return null;
        if (!Number.isFinite(parsed.checkedAt) || Date.now() - parsed.checkedAt > CACHE_TTL) return null;
        return parsed.data || null;
    } catch (_) {
        return null;
    }
};

const writeCache = (localVersion, data) => {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ localVersion, checkedAt: Date.now(), data }));
    } catch (_) {}
};

const getLocalManifest = async () => {
    const response = await fetchWithTimeout(LOCAL_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Local manifest request failed (${response.status})`);
    return await response.json();
};

const getInstalledExtensionName = () => {
    try {
        const rootUrl = new URL('../', import.meta.url);
        const segments = rootUrl.pathname.split('/').filter(Boolean);
        return decodeURIComponent(segments.at(-1) || 'NastyTavern-UI');
    } catch (_) {
        return 'NastyTavern-UI';
    }
};

const getNativeHeaders = () => {
    const context = getContextSafe();
    try {
        return context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
    } catch (_) {
        return { 'Content-Type': 'application/json' };
    }
};

const requestExtensionEndpoint = async (endpoint, extensionName, global, timeout = REQUEST_TIMEOUT) => {
    const response = await fetchWithTimeout(`/api/extensions/${endpoint}`, {
        method: 'POST',
        headers: getNativeHeaders(),
        body: JSON.stringify({ extensionName, global }),
    }, timeout);

    let data = null;
    let text = '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try { data = await response.json(); }
        catch (_) {}
    } else {
        try { text = await response.text(); }
        catch (_) {}
    }

    return { response, data, text };
};

const getNativeRepoStatus = async extensionName => {
    try {
        const local = await requestExtensionEndpoint('version', extensionName, false);
        if (local.response.ok && local.data) return { ...local.data, extensionGlobal: false };
        if (local.response.status !== 404) return null;

        const global = await requestExtensionEndpoint('version', extensionName, true);
        if (global.response.ok && global.data) return { ...global.data, extensionGlobal: true };
    } catch (error) {
        console.warn('[NastyTavern] SillyTavern native extension update check unavailable', error);
    }
    return null;
};

const makeBaseResult = manifest => ({
    state: 'unavailable',
    localVersion: cleanVersion(manifest?.version),
    latestVersion: cleanVersion(manifest?.version),
    changes: [],
    repositoryUrl: REPOSITORY_URL,
    changelogUrl: CHANGELOG_URL,
    extensionName: getInstalledExtensionName(),
    extensionGlobal: null,
    nativeManaged: false,
});

const getLocalReleaseNotes = async version => {
    try {
        const localChangelog = await fetchText(LOCAL_CHANGELOG_URL);
        return parseChangelog(localChangelog, entryVersion => compareVersions(entryVersion, version) === 0);
    } catch (_) {
        return [];
    }
};

export async function getNastyTavernUpdateInfo({ force = false } = {}) {
    let localManifest;
    try {
        localManifest = await getLocalManifest();
    } catch (error) {
        console.warn('[NastyTavern] Could not read local manifest for update check', error);
        return null;
    }

    const base = makeBaseResult(localManifest);
    if (!base.localVersion) return null;

    if (!force) {
        const cached = readCache(base.localVersion);
        if (cached) return cached;
    }

    const [manifestResult, changelogResult, nativeResult] = await Promise.allSettled([
        fetchJson(REMOTE_MANIFEST_URL),
        fetchText(REMOTE_CHANGELOG_URL, { remote: true }),
        getNativeRepoStatus(base.extensionName),
    ]);

    const remoteManifest = manifestResult.status === 'fulfilled' ? manifestResult.value : null;
    const remoteChangelog = changelogResult.status === 'fulfilled' ? changelogResult.value : '';
    const nativeStatus = nativeResult.status === 'fulfilled' ? nativeResult.value : null;
    const remoteVersion = cleanVersion(remoteManifest?.version);
    const latestVersion = remoteVersion || base.localVersion;

    let state = 'unavailable';
    if (nativeStatus && typeof nativeStatus.isUpToDate === 'boolean') {
        state = nativeStatus.isUpToDate ? 'current' : 'available';
    } else if (remoteVersion) {
        state = compareVersions(remoteVersion, base.localVersion) > 0 ? 'available' : 'current';
    }

    let changes = remoteChangelog
        ? parseChangelog(remoteChangelog, version => compareVersions(version, latestVersion) === 0)
        : [];
    if (!changes.length && state !== 'available' && compareVersions(latestVersion, base.localVersion) === 0) {
        changes = await getLocalReleaseNotes(base.localVersion);
    }

    const result = {
        ...base,
        state,
        latestVersion,
        changes,
        extensionGlobal: nativeStatus?.extensionGlobal ?? null,
        nativeManaged: Boolean(nativeStatus),
    };

    writeCache(base.localVersion, result);
    return result;
}

export async function updateNastyTavernExtension(info = {}) {
    const extensionName = String(info.extensionName || getInstalledExtensionName()).trim();
    if (!extensionName) throw new Error('Could not determine the NastyTavern extension folder.');

    const preferredGlobal = typeof info.extensionGlobal === 'boolean' ? info.extensionGlobal : false;
    const attempts = typeof info.extensionGlobal === 'boolean'
        ? [preferredGlobal]
        : [false, true];

    let lastError = null;
    for (const global of attempts) {
        try {
            const result = await requestExtensionEndpoint('update', extensionName, global, UPDATE_TIMEOUT);
            if (result.response.ok) return { ...(result.data || {}), extensionGlobal: global };

            const message = result.text || result.data?.error || result.response.statusText || `HTTP ${result.response.status}`;
            lastError = new Error(message);
            if (result.response.status !== 404) break;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            break;
        }
    }

    throw lastError || new Error('NastyTavern update failed.');
}
