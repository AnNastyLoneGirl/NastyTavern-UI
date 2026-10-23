const clone = value => {
    try { return structuredClone(value); }
    catch (_) {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return value; }
    }
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const clean = value => String(value ?? '').trim();

export const VARIABLE_ACTIVATION_MODE = 'variable';

export function getVariableActivationMeta(entry) {
    const activation = entry?.extensions?.nastyTavern?.activation;
    return activation?.mode === VARIABLE_ACTIVATION_MODE ? activation : null;
}

export function isVariableActivationEntry(entry) {
    return Boolean(getVariableActivationMeta(entry));
}

function normalizeStoredValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (text === '') return '';
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
    if (/^true$/i.test(text)) return true;
    if (/^false$/i.test(text)) return false;
    if (/^null$/i.test(text)) return null;
    return value;
}

function variableStores(context) {
    const local = context?.chatMetadata?.variables || context?.chat_metadata?.variables || {};
    const global = context?.extensionSettings?.variables?.global || context?.extension_settings?.variables?.global || {};
    return { local, global };
}

function apiValue(context, scope, name) {
    const api = context?.variables?.[scope];
    try {
        if (api?.has?.(name) && typeof api?.get === 'function') return { found: true, value: api.get(name) };
    } catch (_) {}
    return null;
}

export function resolveVariableReference(reference, context) {
    const raw = clean(reference);
    if (!raw.startsWith('.')) return { found: false, scope: '', name: raw, value: undefined };

    let body = raw.slice(1);
    let explicitScope = '';
    if (body.startsWith('local.')) {
        explicitScope = 'local';
        body = body.slice(6);
    } else if (body.startsWith('global.')) {
        explicitScope = 'global';
        body = body.slice(7);
    }

    const name = body.trim();
    if (!name) return { found: false, scope: explicitScope, name: '', value: undefined };
    const stores = variableStores(context);

    const read = scope => {
        const fromApi = apiValue(context, scope, name);
        if (fromApi?.found) return { found: true, scope, name, value: normalizeStoredValue(fromApi.value) };
        const store = scope === 'local' ? stores.local : stores.global;
        if (hasOwn(store, name)) return { found: true, scope, name, value: normalizeStoredValue(store[name]) };
        return null;
    };

    if (explicitScope) return read(explicitScope) || { found: false, scope: explicitScope, name, value: undefined };
    return read('local') || read('global') || { found: false, scope: '', name, value: undefined };
}

function tokenize(source) {
    const tokens = [];
    let index = 0;

    const push = (type, value, raw = value) => tokens.push({ type, value, raw });
    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        const pair = source.slice(index, index + 2);
        if (['&&', '||', '==', '!=', '>=', '<='].includes(pair)) {
            push('operator', pair);
            index += 2;
            continue;
        }
        if (['!', '>', '<'].includes(char)) {
            push('operator', char);
            index += 1;
            continue;
        }
        if (char === '(' || char === ')') {
            push('paren', char);
            index += 1;
            continue;
        }
        if (char === '"' || char === "'") {
            const quote = char;
            let value = '';
            let closed = false;
            index += 1;
            while (index < source.length) {
                const current = source[index++];
                if (current === quote) {
                    closed = true;
                    break;
                }
                if (current === '\\' && index < source.length) {
                    const escaped = source[index++];
                    if (escaped === 'n') value += '\n';
                    else if (escaped === 'r') value += '\r';
                    else if (escaped === 't') value += '\t';
                    else value += escaped;
                } else {
                    value += current;
                }
            }
            if (!closed) throw new Error('Unclosed string.');
            push('literal', value);
            continue;
        }
        if (char === '.') {
            const start = index;
            index += 1;
            while (index < source.length && /[A-Za-z0-9_.-]/.test(source[index])) index += 1;
            const raw = source.slice(start, index);
            if (raw === '.') throw new Error('Variable name expected after “.”.');
            push('variable', raw);
            continue;
        }

        const number = source.slice(index).match(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
        if (number) {
            push('literal', Number(number[0]), number[0]);
            index += number[0].length;
            continue;
        }

        const word = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
        if (word) {
            const raw = word[0];
            const lower = raw.toLowerCase();
            if (lower === 'true') push('literal', true, raw);
            else if (lower === 'false') push('literal', false, raw);
            else if (lower === 'null') push('literal', null, raw);
            else throw new Error(`Unknown token “${raw}”. Strings must be quoted.`);
            index += raw.length;
            continue;
        }

        throw new Error(`Unexpected token “${char}”.`);
    }

    return tokens;
}

function comparable(value) {
    return normalizeStoredValue(value);
}

function equals(left, right) {
    const a = comparable(left);
    const b = comparable(right);
    if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
    return a === b;
}

function relational(left, right, operator) {
    const a = comparable(left);
    const b = comparable(right);
    if (a === undefined || b === undefined || a === null || b === null) return false;
    if (typeof a === 'number' && typeof b === 'number') {
        if (operator === '>') return a > b;
        if (operator === '>=') return a >= b;
        if (operator === '<') return a < b;
        return a <= b;
    }
    const aText = String(a);
    const bText = String(b);
    if (operator === '>') return aText > bText;
    if (operator === '>=') return aText >= bText;
    if (operator === '<') return aText < bText;
    return aText <= bText;
}

function truthy(value) {
    return Boolean(comparable(value));
}

class ConditionParser {
    constructor(tokens, context) {
        this.tokens = tokens;
        this.context = context;
        this.index = 0;
        this.variables = [];
    }

    peek(value = null) {
        const token = this.tokens[this.index] || null;
        if (!token) return null;
        return value === null || token.value === value ? token : null;
    }

    take(value = null) {
        const token = this.peek(value);
        if (!token) return null;
        this.index += 1;
        return token;
    }

    parse() {
        if (!this.tokens.length) throw new Error('Condition is empty.');
        const value = this.parseOr();
        if (this.index < this.tokens.length) throw new Error(`Unexpected token “${this.tokens[this.index].raw}”.`);
        return truthy(value);
    }

    parseOr() {
        let value = this.parseAnd();
        while (this.take('||')) {
            const right = this.parseAnd();
            value = truthy(value) || truthy(right);
        }
        return value;
    }

    parseAnd() {
        let value = this.parseComparison();
        while (this.take('&&')) {
            const right = this.parseComparison();
            value = truthy(value) && truthy(right);
        }
        return value;
    }

    parseComparison() {
        let value = this.parseUnary();
        while (true) {
            const operator = this.peek()?.value;
            if (!['==', '!=', '>', '>=', '<', '<='].includes(operator)) break;
            this.index += 1;
            const right = this.parseUnary();
            if (operator === '==') value = equals(value, right);
            else if (operator === '!=') value = !equals(value, right);
            else value = relational(value, right, operator);
        }
        return value;
    }

    parseUnary() {
        if (this.take('!')) return !truthy(this.parseUnary());
        return this.parsePrimary();
    }

    parsePrimary() {
        const open = this.take('(');
        if (open) {
            const value = this.parseOr();
            if (!this.take(')')) throw new Error('Missing closing parenthesis.');
            return value;
        }

        const token = this.tokens[this.index++];
        if (!token) throw new Error('Value expected.');
        if (token.type === 'literal') return token.value;
        if (token.type === 'variable') {
            const resolved = resolveVariableReference(token.value, this.context);
            this.variables.push({ reference: token.value, ...resolved });
            return resolved.found ? resolved.value : undefined;
        }
        throw new Error(`Value expected before “${token.raw}”.`);
    }
}

export function validateVariableCondition(condition) {
    const source = clean(condition);
    try {
        const parser = new ConditionParser(tokenize(source), {});
        parser.parse();
        return { valid: true, error: '' };
    } catch (error) {
        return { valid: false, error: clean(error?.message) || 'Invalid condition.' };
    }
}

export function evaluateVariableCondition(condition, context = null) {
    const source = clean(condition);
    const activeContext = context || (() => {
        try { return window.SillyTavern?.getContext?.() || {}; }
        catch (_) { return {}; }
    })();

    try {
        const parser = new ConditionParser(tokenize(source), activeContext);
        const parsedValue = parser.parse();
        const missingVariables = parser.variables.filter(variable => !variable.found);
        // A missing runtime variable is an ordinary non-match, never an error.
        // This also prevents expressions such as `.flag != true` or `!.flag`
        // from accidentally activating an entry before the variable exists.
        const value = missingVariables.length ? false : Boolean(parsedValue);
        return {
            valid: true,
            value,
            error: '',
            variables: parser.variables,
            missingVariables,
        };
    } catch (error) {
        return { valid: false, value: false, error: clean(error?.message) || 'Invalid condition.', variables: [], missingVariables: [] };
    }
}

export function formatVariableConditionStatus(result) {
    if (!result?.valid) return { state: 'error', text: result?.error || 'Invalid condition.' };
    const used = Array.isArray(result.variables) ? result.variables : [];
    const first = used[0];
    const valueText = first
        ? `${first.reference} = ${first.found ? JSON.stringify(first.value) : 'missing'}`
        : '';
    return {
        state: result.value ? 'true' : 'false',
        text: `${result.value ? 'TRUE' : 'FALSE'}${valueText ? ` · ${valueText}` : ''}`,
    };
}

function entryByUid(data, uid) {
    const entries = data?.entries || {};
    return entries?.[uid]
        || entries?.[Number(uid)]
        || Object.values(entries).find(entry => clean(entry?.uid) === clean(uid))
        || null;
}

function ensureNastyMetadata(entry) {
    entry.extensions ||= {};
    entry.extensions.nastyTavern ||= {};
    return entry.extensions.nastyTavern;
}

function cleanupNastyMetadata(entry) {
    const nasty = entry?.extensions?.nastyTavern;
    if (!nasty || Object.keys(nasty).length) return;
    delete entry.extensions.nastyTavern;
    if (entry.extensions && !Object.keys(entry.extensions).length) delete entry.extensions;
}

export class LorebookVariableActivation {
    constructor(toast = null) {
        this.toast = toast;
        this.events = [];
        this.mounted = false;
        this.registry = new Map();
        this.lastResults = new Map();
        this.repairing = new Set();
        this.boundLoaded = lores => this.onEntriesLoaded(lores);
        this.boundUpdated = (name, data) => this.onWorldInfoUpdated(name, data);
    }

    key(world, uid) {
        return `${clean(world)}.${clean(uid)}`;
    }

    getContext() {
        try { return window.SillyTavern?.getContext?.() || {}; }
        catch (_) { return {}; }
    }

    mount() {
        if (this.mounted) return;
        this.mounted = true;
        const context = this.getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types) return;
        for (const [type, handler] of [
            [types.WORLDINFO_ENTRIES_LOADED, this.boundLoaded],
            [types.WORLDINFO_UPDATED, this.boundUpdated],
        ]) {
            if (!type) continue;
            try {
                source.on(type, handler);
                this.events.push({ source, type, handler });
            } catch (_) {}
        }
    }

    unmount() {
        for (const { source, type, handler } of this.events) {
            try { source?.removeListener?.(type, handler); } catch (_) {}
        }
        this.events = [];
        this.registry.clear();
        this.lastResults.clear();
        this.repairing.clear();
        this.mounted = false;
    }

    evaluate(condition) {
        return evaluateVariableCondition(condition, this.getContext());
    }

    getLastResult(world, uid) {
        return this.lastResults.get(this.key(world, uid)) || null;
    }

    rememberEntry(entry) {
        const meta = getVariableActivationMeta(entry);
        const key = this.key(entry?.world, entry?.uid);
        if (meta) this.registry.set(key, clone(meta));
        else this.registry.delete(key);
    }

    async onEntriesLoaded(lores) {
        const lists = [lores?.globalLore, lores?.characterLore, lores?.chatLore, lores?.personaLore];
        const entries = lists.flatMap(list => Array.isArray(list) ? list : []);
        const active = [];
        const seen = new Set();

        for (const entry of entries) {
            const key = this.key(entry?.world, entry?.uid);
            if (seen.has(key)) continue;
            seen.add(key);
            this.rememberEntry(entry);

            const meta = getVariableActivationMeta(entry);
            if (!meta || entry?.disable) continue;
            const result = this.evaluate(meta.condition || '');
            this.lastResults.set(key, result);
            if (result.valid && result.value) active.push(entry);
        }

        if (!active.length) return;
        const context = this.getContext();
        const source = context?.eventSource;
        const types = context?.eventTypes || context?.event_types;
        if (!source || !types?.WORLDINFO_FORCE_ACTIVATE) return;
        try { await source.emit(types.WORLDINFO_FORCE_ACTIVATE, active); }
        catch (error) { console.warn('[NastyTavern] Variable Lorebook activation failed.', error); }
    }

    async onWorldInfoUpdated(name, data) {
        const world = clean(name);
        if (!world || !data?.entries || this.repairing.has(world)) return;
        let changed = false;

        for (const entry of Object.values(data.entries)) {
            const key = this.key(world, entry?.uid);
            const remembered = this.registry.get(key);
            if (!remembered) continue;
            const current = getVariableActivationMeta(entry);
            if (JSON.stringify(current) !== JSON.stringify(remembered)) {
                const nasty = ensureNastyMetadata(entry);
                nasty.activation = clone(remembered);
                entry.constant = false;
                entry.vectorized = false;
                entry.key = [];
                entry.keysecondary = [];
                changed = true;
            }
        }

        if (!changed) return;
        try {
            this.repairing.add(world);
            const module = await import('/scripts/world-info.js');
            await module.saveWorldInfo?.(world, data, true);
        } catch (error) {
            console.warn('[NastyTavern] Could not preserve Variable Lorebook metadata.', error);
        } finally {
            this.repairing.delete(world);
        }
    }

    async patchEntry(world, uid, mutator) {
        const book = clean(world);
        const entryUid = clean(uid);
        if (!book || !entryUid) return null;
        const module = await import('/scripts/world-info.js');
        const data = await module.loadWorldInfo?.(book);
        const entry = entryByUid(data, entryUid);
        if (!data || !entry) return null;

        const registryKey = this.key(book, entryUid);
        const hadRemembered = this.registry.has(registryKey);
        const previousRemembered = hadRemembered ? clone(this.registry.get(registryKey)) : null;

        await mutator(entry, data);

        // saveWorldInfo can synchronously/asynchronously emit WORLDINFO_UPDATED.
        // Publish the new metadata to the preservation registry *before* saving,
        // otherwise our own update handler may mistake the intentional edit for
        // metadata stripped by SillyTavern and restore the previous condition.
        this.rememberEntry({ ...entry, world: book });
        try {
            await module.saveWorldInfo?.(book, data, true);
        } catch (error) {
            if (hadRemembered) this.registry.set(registryKey, previousRemembered);
            else this.registry.delete(registryKey);
            throw error;
        }
        return { data, entry };
    }

    async setMode(world, uid, mode) {
        const targetMode = ['constant', 'normal', 'vectorized', VARIABLE_ACTIVATION_MODE].includes(mode) ? mode : 'normal';
        return this.patchEntry(world, uid, entry => {
            const existing = getVariableActivationMeta(entry);
            if (targetMode === VARIABLE_ACTIVATION_MODE) {
                const nasty = ensureNastyMetadata(entry);
                const backup = existing?.backup || {
                    key: clone(entry.key ?? []),
                    keysecondary: clone(entry.keysecondary ?? []),
                    constant: Boolean(entry.constant),
                    vectorized: Boolean(entry.vectorized),
                };
                nasty.activation = {
                    mode: VARIABLE_ACTIVATION_MODE,
                    condition: clean(existing?.condition || nasty.variableCondition),
                    backup,
                };
                entry.constant = false;
                entry.vectorized = false;
                entry.key = [];
                entry.keysecondary = [];
                return;
            }

            if (existing?.backup) {
                if (hasOwn(existing.backup, 'key')) entry.key = clone(existing.backup.key);
                if (hasOwn(existing.backup, 'keysecondary')) entry.keysecondary = clone(existing.backup.keysecondary);
            }
            entry.constant = targetMode === 'constant';
            entry.vectorized = targetMode === 'vectorized';
            if (entry?.extensions?.nastyTavern) {
                const previousCondition = clean(existing?.condition);
                if (previousCondition) entry.extensions.nastyTavern.variableCondition = previousCondition;
                delete entry.extensions.nastyTavern.activation;
                cleanupNastyMetadata(entry);
            }
            this.registry.delete(this.key(world, uid));
            this.lastResults.delete(this.key(world, uid));
        });
    }

    async setCondition(world, uid, condition) {
        return this.patchEntry(world, uid, entry => {
            const existing = getVariableActivationMeta(entry);
            if (!existing) return;
            const nasty = ensureNastyMetadata(entry);
            nasty.activation = {
                ...clone(existing),
                mode: VARIABLE_ACTIVATION_MODE,
                condition: clean(condition),
            };
            entry.constant = false;
            entry.vectorized = false;
            entry.key = [];
            entry.keysecondary = [];
            // Conditions are only evaluated against runtime variables during
            // WORLDINFO_ENTRIES_LOADED. Editing merely persists the expression.
            this.lastResults.delete(this.key(world, uid));
        });
    }
}
