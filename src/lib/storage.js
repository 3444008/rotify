/*
 * Rotify - сохранение состояния в localStorage.
 * Работает с обычными объектами; employee.unavailable сериализуем как массив.
 */

const CONFIG_KEY = 'rotify.config.v1';
const RESULT_KEY = 'rotify.result.v1';

function available() {
    try {
        const k = '__rotify_test__';

        localStorage.setItem(k, '1');
        localStorage.removeItem(k);

        return true;
    } catch {
        return false;
    }
}

/** Приводит config к JSON-безопасному виду (Set -> массив). */
function serializeConfig(config) {
    return {
        employees: (config.employees || []).map((emp) => ({
            id: emp.id,
            name: emp.name,
            unavailable: emp.unavailable instanceof Set
                ? Array.from(emp.unavailable)
                : (emp.unavailable || []),
        })),
        requiredPerDay: config.requiredPerDay,
        maxConsecutive: config.maxConsecutive,
        year: config.year,
        month: config.month,
    };
}

export function saveConfig(config) {
    if (!available()) {
        return false;
    }

    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(serializeConfig(config)));

        return true;
    } catch {
        return false;
    }
}

export function loadConfig() {
    if (!available()) {
        return null;
    }

    try {
        const raw = localStorage.getItem(CONFIG_KEY);

        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveResult(result) {
    if (!available()) {
        return false;
    }

    try {
        localStorage.setItem(RESULT_KEY, JSON.stringify(result));

        return true;
    } catch {
        return false;
    }
}

export function loadResult() {
    if (!available()) {
        return null;
    }

    try {
        const raw = localStorage.getItem(RESULT_KEY);

        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clear() {
    if (!available()) {
        return;
    }

    try {
        localStorage.removeItem(CONFIG_KEY);
        localStorage.removeItem(RESULT_KEY);
    } catch {
        // игнорируем
    }
}
