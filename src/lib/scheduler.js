/*
 * Rotify - ядро генерации графика смен (чистые функции, без DOM).
 *
 * config = {
 *   employees: [{id, name, unavailable: string[] | Set<'YYYY-MM-DD'>}],
 *   requiredPerDay: number,   // R - человек на смене каждый день
 *   maxConsecutive: number,   // X - не более X рабочих дней подряд
 *   year: number,
 *   month: number,            // 0-11
 * }
 */

const pad2 = (n) => String(n).padStart(2, '0');

/** Формат 'YYYY-MM-DD' (month: 0-11). */
const formatDate = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;

/** Список всех дат месяца 'YYYY-MM-DD'. month: 0-11. */
export function getMonthDates(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dates = [];

    for (let d = 1; d <= daysInMonth; d++) {
        dates.push(formatDate(year, month, d));
    }

    return dates;
}

/** День недели (0=Вс ... 6=Сб) для строки 'YYYY-MM-DD'. */
export function dayOfWeek(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);

    return new Date(y, m - 1, d).getDay();
}

/** Приводит employee.unavailable (массив или Set) к Set. */
function unavailableSet(emp) {
    if (emp.unavailable instanceof Set) {
        return emp.unavailable;
    }

    return new Set(emp.unavailable || []);
}

const isAvailable = (unavailSet, dateStr) => !unavailSet.has(dateStr);

/*
 * Детерминированный ГПСЧ (mulberry32) - для воспроизводимых рестартов.
 * Используется только как финальный tie-break среди полностью равных
 * кандидатов, поэтому не влияет на баланс смен, но разнообразит попытки.
 */
function mulberry32(seed) {
    let a = seed >>> 0;

    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Математическая предпроверка выполнимости до генерации.
 * -> {feasible, errors: string[], warnings: string[]}
 */
export function checkFeasibility(config) {
    const errors = [];
    const warnings = [];
    const employees = config.employees || [];
    const N = employees.length;
    const R = config.requiredPerDay;
    const X = config.maxConsecutive;

    if (!Number.isInteger(R) || R < 1) {
        errors.push('Число человек на смене должно быть целым и не меньше 1.');
    }

    if (!Number.isInteger(X) || X < 1) {
        errors.push('Максимум дней подряд должен быть целым и не меньше 1.');
    }

    if (N === 0) {
        errors.push('Добавьте хотя бы одного сотрудника.');
    }

    if (errors.length) {
        return {feasible: false, errors, warnings};
    }

    // 1) Людей всего меньше, чем нужно на одной смене.
    if (N < R) {
        errors.push(
            `Сотрудников (${N}) меньше, чем требуется на смене (${R}). ` +
            'График составить невозможно.',
        );
    }

    // Ограничение "не более X подряд" НЕ проверяем здесь: оно мягкое.
    // Если в какой-то день доступно ровно столько людей, сколько нужно,
    // они выходят даже с переработкой - это фиксирует генератор и помечает
    // предупреждением, а не ошибкой.

    // 2) Дни, где доступно меньше сотрудников, чем нужно на смене (жёсткий блок).
    const dates = getMonthDates(config.year, config.month);
    const sets = employees.map(unavailableSet);
    const shortDays = [];

    for (const date of dates) {
        let available = 0;

        for (const set of sets) {
            if (isAvailable(set, date)) {
                available++;
            }
        }

        if (available < R) {
            shortDays.push(date);
        }
    }

    if (shortDays.length) {
        const preview = shortDays.slice(0, 5).join(', ');
        const tail = shortDays.length > 5 ? ` и ещё ${shortDays.length - 5}` : '';

        errors.push(
            `В некоторые дни доступно меньше ${R} сотрудников: ${preview}${tail}` +
            '. В эти дни смену не закрыть.',
        );
    }

    return {feasible: errors.length === 0, errors, warnings};
}

/**
 * Один детерминированный жадный проход. Всегда заполняет смену (предпроверка
 * гарантирует, что доступных >= R). Если "свежих" (в пределах лимита) не хватает,
 * добираются те, кто уже отработал лимит - вынужденная переработка.
 * seed влияет только на tie-break равных кандидатов.
 * -> {schedule}
 */
function greedyPass(config, dates, sets, seed) {
    const employees = config.employees;
    const N = employees.length;
    const R = config.requiredPerDay;
    const X = config.maxConsecutive;
    const rand = mulberry32(seed);

    const shifts = new Array(N).fill(0);
    const streak = new Array(N).fill(0);
    const rest = new Array(N).fill(0);
    const jitter = new Array(N);

    for (let k = 0; k < N; k++) {
        jitter[k] = rand();
    }

    const schedule = [];

    for (const date of dates) {
        const available = [];

        for (let e = 0; e < N; e++) {
            if (isAvailable(sets[e], date)) {
                available.push(e);
            }
        }

        // Уложившиеся в лимит. Приоритет: 1) меньше смен (равенство);
        // 2) дольше отдыхал (чередование); 3) джиттер (устойчивый tie-break).
        const underLimit = available.filter((e) => streak[e] < X);

        underLimit.sort((a, b) => {
            if (shifts[a] !== shifts[b]) {
                return shifts[a] - shifts[b];
            }

            if (rest[a] !== rest[b]) {
                return rest[b] - rest[a];
            }

            return jitter[a] - jitter[b];
        });

        let selected;

        if (underLimit.length >= R) {
            selected = underLimit.slice(0, R);
        } else {
            // Не хватает свежих - добираем переработкой: сначала с наименьшей серией.
            const overLimit = available
                .filter((e) => streak[e] >= X)
                .sort((a, b) => (streak[a] - streak[b]) ||
                    (shifts[a] - shifts[b]) || (jitter[a] - jitter[b]));

            selected = underLimit.concat(overLimit).slice(0, R);
        }

        const selectedSet = new Set(selected);

        for (let s = 0; s < N; s++) {
            if (selectedSet.has(s)) {
                shifts[s]++;
                streak[s]++;
                rest[s] = 0;
            } else {
                streak[s] = 0;
                rest[s]++;
            }
        }

        schedule.push({
            date,
            dow: dayOfWeek(date),
            workers: selected.map((idx) => employees[idx].id),
        });
    }

    return {schedule};
}

const fmtDayMonth = (date) => {
    const [, m, d] = date.split('-');

    return `${d}.${m}`;
};

/** Склонение слова "день" под число: 1 день, 4 дня, 5 дней. */
function pluralDays(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;

    if (mod10 === 1 && mod100 !== 11) {
        return 'день';
    }

    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return 'дня';
    }

    return 'дней';
}

/**
 * Анализ переработки: находит серии длиннее X.
 * -> {overtimeDays, offenders: [{id, name, len, start, end}], keys: 'id|date'[]}
 */
function analyzeOvertime(schedule, employees, X) {
    const n = employees.length;
    const ids = employees.map((e) => e.id);
    const streak = new Array(n).fill(0);
    const runStart = new Array(n).fill(null);
    const worst = new Array(n).fill(null);
    const keys = [];
    let overtimeDays = 0;

    schedule.forEach((day) => {
        const working = new Set(day.workers);

        for (let i = 0; i < n; i++) {
            if (!working.has(ids[i])) {
                streak[i] = 0;

                continue;
            }

            if (streak[i] === 0) {
                runStart[i] = day.date;
            }

            streak[i]++;

            if (streak[i] > X) {
                overtimeDays++;
                keys.push(`${ids[i]}|${day.date}`);
            }

            if (!worst[i] || streak[i] > worst[i].len) {
                worst[i] = {len: streak[i], start: runStart[i], end: day.date};
            }
        }
    });

    const offenders = [];

    for (let i = 0; i < n; i++) {
        if (worst[i] && worst[i].len > X) {
            offenders.push({
                id: ids[i],
                name: employees[i].name,
                len: worst[i].len,
                start: worst[i].start,
                end: worst[i].end,
            });
        }
    }

    return {overtimeDays, offenders, keys};
}

function emptyStats(employees) {
    const byEmployee = {};

    (employees || []).forEach((emp) => {
        byEmployee[emp.id] = 0;
    });

    return {byEmployee, min: 0, max: 0, spread: 0};
}

/** computeStats(schedule, employees) -> {byEmployee, min, max, spread}. */
export function computeStats(schedule, employees) {
    const byEmployee = {};

    employees.forEach((emp) => {
        byEmployee[emp.id] = 0;
    });

    schedule.forEach((day) => {
        day.workers.forEach((id) => {
            if (byEmployee[id] === undefined) {
                byEmployee[id] = 0;
            }

            byEmployee[id]++;
        });
    });

    const counts = employees.map((emp) => byEmployee[emp.id]);
    const min = counts.length ? Math.min(...counts) : 0;
    const max = counts.length ? Math.max(...counts) : 0;

    return {byEmployee, min, max, spread: max - min};
}

/** "Вес" переработки графика (в индексном виде): сумма превышений над лимитом
 *  плюс разброс смен для баланса. Минимизируется локальным поиском. */
function scheduleCostIdx(sel, N, X) {
    const streak = new Array(N).fill(0);
    const shifts = new Array(N).fill(0);
    let weighted = 0;

    for (const day of sel) {
        const working = new Set(day);

        for (let e = 0; e < N; e++) {
            if (working.has(e)) {
                streak[e]++;
                shifts[e]++;

                if (streak[e] > X) {
                    weighted += streak[e] - X;
                }
            } else {
                streak[e] = 0;
            }
        }
    }

    const spread = Math.max(...shifts) - Math.min(...shifts);

    return weighted * 10000 + spread;
}

const maxRun = (report) => report.offenders.reduce((m, o) => Math.max(m, o.len), 0);

/** Строго ли кандидат лучше по (переработка, макс.серия, разброс). */
function isBetterQuality(schedule, report, greedyBest, employees) {
    if (report.overtimeDays !== greedyBest.report.overtimeDays) {
        return report.overtimeDays < greedyBest.report.overtimeDays;
    }

    const mrA = maxRun(report);
    const mrB = maxRun(greedyBest.report);

    if (mrA !== mrB) {
        return mrA < mrB;
    }

    return computeStats(schedule, employees).spread <
        computeStats(greedyBest.schedule, employees).spread;
}

/**
 * Дораспределение неизбежной переработки локальным поиском (мультистарт).
 * Работает в пространстве индексов сотрудников. Для больших конфигураций
 * (много людей/сочетаний) пропускается - остаётся жадный результат.
 * -> {schedule, report} если строго лучше жадного, иначе null.
 */
function optimizeOvertime(dates, sets, employees, R, X, greedyBest) {
    const N = employees.length;
    const dayCombos = [];
    let maxCombos = 0;

    for (const date of dates) {
        const av = [];

        for (let e = 0; e < N; e++) {
            if (isAvailable(sets[e], date)) {
                av.push(e);
            }
        }

        const combos = [];

        const rec = (start, cur) => {
            if (cur.length === R) {
                combos.push(cur.slice());

                return;
            }

            for (let i = start; i < av.length; i++) {
                cur.push(av[i]);
                rec(i + 1, cur);
                cur.pop();
            }
        };

        rec(0, []);
        dayCombos.push(combos);
        maxCombos = Math.max(maxCombos, combos.length);
    }

    // Слишком объёмный перебор - не рискуем отзывчивостью, оставляем жадный.
    if (N > 8 || maxCombos > 150) {
        return null;
    }

    const restarts = 30;
    let bestSel = null;
    let bestCost = Infinity;

    for (let r = 0; r < restarts; r++) {
        const rand = mulberry32(r + 1);
        const sel = dayCombos.map((cs) => cs[Math.floor(rand() * cs.length)]);

        let improved = true;
        let sweeps = 0;

        while (improved && sweeps < 16) {
            improved = false;
            sweeps++;

            for (let d = 0; d < sel.length; d++) {
                let localCost = scheduleCostIdx(sel, N, X);
                let localBest = sel[d];

                for (const cand of dayCombos[d]) {
                    const prev = sel[d];

                    sel[d] = cand;

                    const c = scheduleCostIdx(sel, N, X);

                    if (c < localCost) {
                        localCost = c;
                        localBest = cand;
                    }

                    sel[d] = prev;
                }

                if (localBest !== sel[d]) {
                    sel[d] = localBest;
                    improved = true;
                }
            }
        }

        const cost = scheduleCostIdx(sel, N, X);

        if (cost < bestCost) {
            bestCost = cost;
            bestSel = sel.map((a) => a.slice());
        }
    }

    const schedule = dates.map((date, d) => ({
        date,
        dow: dayOfWeek(date),
        workers: bestSel[d].map((idx) => employees[idx].id),
    }));
    const report = analyzeOvertime(schedule, employees, X);

    return isBetterQuality(schedule, report, greedyBest, employees)
        ? {schedule, report}
        : null;
}

/**
 * generateSchedule(config, options?) -> result.
 * Всегда строит график, если смены в принципе можно закрыть (доступных >= R
 * каждый день). Из нескольких детерминированных попыток выбирает вариант с
 * наименьшей переработкой. Превышение лимита "дней подряд" не ошибка, а
 * предупреждение (переработка) - см. result.warnings / result.overtime.
 * result = {ok, schedule, stats, message, warnings, overtime, overtimeKeys}.
 */
export function generateSchedule(config, options) {
    const attempts = (options && options.attempts) || 200;
    const pre = checkFeasibility(config);

    if (!pre.feasible) {
        return {
            ok: false,
            schedule: [],
            stats: emptyStats(config.employees),
            message: pre.errors.join(' '),
            warnings: [],
            overtime: [],
            overtimeKeys: [],
        };
    }

    const dates = getMonthDates(config.year, config.month);
    const sets = config.employees.map(unavailableSet);
    const employees = config.employees;
    const R = config.requiredPerDay;
    const X = config.maxConsecutive;

    let best = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const pass = greedyPass(config, dates, sets, attempt + 1);
        const report = analyzeOvertime(pass.schedule, employees, X);

        if (!best || report.overtimeDays < best.report.overtimeDays) {
            best = {schedule: pass.schedule, report};
        }

        // Идеальный вариант без переработки - дальше искать незачем.
        if (report.overtimeDays === 0) {
            break;
        }
    }

    // Переработка неизбежна - пробуем распределить её ровнее локальным поиском.
    if (best.report.overtimeDays > 0) {
        const better = optimizeOvertime(dates, sets, employees, R, X, best);

        if (better) {
            best = better;
        }
    }

    const stats = computeStats(best.schedule, employees);
    const warnings = [...pre.warnings];
    let message;

    if (best.report.offenders.length === 0) {
        message = `График построен. Смен у каждого: от ${stats.min} до ` +
            `${stats.max} (разброс ${stats.spread}).`;
    } else {
        message = `График построен, но уложиться в лимит "не более ${X} дней подряд" ` +
            'при заданных отгулах невозможно - часть смен идёт с переработкой.';

        warnings.push(...buildOvertimeWarnings(best.report));
    }

    return {
        ok: true,
        schedule: best.schedule,
        stats,
        message,
        warnings,
        overtime: best.report.offenders,
        overtimeKeys: best.report.keys,
    };
}

/**
 * buildCalendarMatrix(schedule) -> недели[], каждая - массив из 7 ячеек.
 * Ячейка = null (пустая) либо {date, day, dow, isWeekend, workers: id[]}.
 * Неделя начинается с понедельника.
 */
export function buildCalendarMatrix(schedule) {
    if (!schedule || !schedule.length) {
        return [];
    }

    const firstCol = (schedule[0].dow + 6) % 7;
    const cells = [];

    for (let b = 0; b < firstCol; b++) {
        cells.push(null);
    }

    schedule.forEach((day) => {
        cells.push({
            date: day.date,
            day: Number(day.date.split('-')[2]),
            dow: day.dow,
            isWeekend: day.dow === 0 || day.dow === 6,
            workers: day.workers.slice(),
        });
    });

    while (cells.length % 7 !== 0) {
        cells.push(null);
    }

    const weeks = [];

    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    return weeks;
}

/** Тексты предупреждений о переработке из отчёта analyzeOvertime. */
function buildOvertimeWarnings(report) {
    return report.offenders.map((o) =>
        `Переработка у "${o.name || 'Без имени'}": ${o.len} ${pluralDays(o.len)} ` +
        `подряд (с ${fmtDayMonth(o.start)} по ${fmtDayMonth(o.end)}).`);
}

/** Компактная запись набора длин: [2] -> "2", [2,3] -> "2-3", [1,2,3] -> "1-3". */
function rangeLabel(arr) {
    if (!arr.length) {
        return '0';
    }

    const uniq = [...new Set(arr)].sort((a, b) => a - b);

    return uniq.length === 1 ? String(uniq[0]) : `${uniq[0]}-${uniq[uniq.length - 1]}`;
}

/**
 * Собирает длины рабочих серий и серий выходных по всем сотрудникам.
 * trim=true отбрасывает первую и последнюю серию каждого - это края месяца,
 * обрезанные произвольно (серии продолжаются в соседние месяцы), поэтому для
 * распознавания устоявшегося ритма их не учитываем.
 */
function collectRuns(schedule, ids, trim) {
    const work = [];
    const rest = [];

    ids.forEach((id) => {
        const runs = [];
        let type = null;
        let len = 0;

        schedule.forEach((day) => {
            const t = day.workers.includes(id) ? 'w' : 'r';

            if (t === type) {
                len++;
            } else {
                if (type) {
                    runs.push([type, len]);
                }

                type = t;
                len = 1;
            }
        });

        if (type) {
            runs.push([type, len]);
        }

        const use = trim ? (runs.length > 2 ? runs.slice(1, -1) : []) : runs;

        use.forEach(([t, l]) => {
            (t === 'w' ? work : rest).push(l);
        });
    });

    return {work, rest};
}

/**
 * Распознаёт ритм графика. trimEdges=true трактует месяц как окно бесконечного
 * цикла (краевые серии не считаются обрывами) - метки получаются чище.
 * -> {label: '2 через 2', maxRun}
 */
function describePattern(schedule, employees, trimEdges) {
    const ids = employees.map((e) => e.id);
    let {work, rest} = collectRuns(schedule, ids, trimEdges);

    // Месяц слишком короткий, внутренних серий нет - считаем как есть.
    if (!work.length) {
        ({work, rest} = collectRuns(schedule, ids, false));
    }

    const maxRun = work.length ? Math.max(...work) : 0;

    return {label: `${rangeLabel(work)} через ${rangeLabel(rest)}`, maxRun};
}

/**
 * Блочный проход: держит бригаду L дней подряд, затем ротация на самых
 * отдохнувших. Так получаются ритмы вроде "2 через 2". Всегда заполняет смену
 * (при нехватке свежих - вынужденная переработка). -> {schedule}.
 */
function blockPass(config, dates, sets, L, seed) {
    const employees = config.employees;
    const N = employees.length;
    const R = config.requiredPerDay;
    const X = config.maxConsecutive;
    const cap = Math.min(L, X);
    const rand = mulberry32(seed);

    const shifts = new Array(N).fill(0);
    const streak = new Array(N).fill(0);
    const rest = new Array(N).fill(0);
    const jitter = Array.from({length: N}, () => rand());

    const schedule = [];

    for (const date of dates) {
        const available = [];

        for (let e = 0; e < N; e++) {
            if (isAvailable(sets[e], date)) {
                available.push(e);
            }
        }

        // 1) Продолжают блок: работали вчера, не добрали cap и в пределах лимита.
        const cont = available
            .filter((e) => streak[e] > 0 && streak[e] < cap && streak[e] < X)
            .sort((a, b) => (streak[b] - streak[a]) || (jitter[a] - jitter[b]));

        let selected = cont.slice(0, R);

        // 2) Добираем свежими (streak === 0) - начинают новый блок; баланс по сменам.
        if (selected.length < R) {
            const chosen = new Set(selected);
            const fresh = available
                .filter((e) => streak[e] === 0 && !chosen.has(e))
                .sort((a, b) => (shifts[a] - shifts[b]) ||
                    (rest[b] - rest[a]) || (jitter[a] - jitter[b]));

            selected = selected.concat(fresh).slice(0, R);
        }

        // 3) Всё ещё не хватает - вынужденная переработка (наименьшая серия).
        if (selected.length < R) {
            const chosen = new Set(selected);
            const forced = available
                .filter((e) => !chosen.has(e))
                .sort((a, b) => (streak[a] - streak[b]) || (shifts[a] - shifts[b]));

            selected = selected.concat(forced).slice(0, R);
        }

        const selectedSet = new Set(selected);

        for (let s = 0; s < N; s++) {
            if (selectedSet.has(s)) {
                shifts[s]++;
                streak[s]++;
                rest[s] = 0;
            } else {
                streak[s] = 0;
                rest[s]++;
            }
        }

        schedule.push({
            date,
            dow: dayOfWeek(date),
            workers: selected.map((idx) => employees[idx].id),
        });
    }

    return {schedule};
}

/**
 * generateVariants(config, options?) -> {ok, errors?, variants}.
 * Строит несколько графиков с разной целевой длиной рабочего блока (1..X),
 * распознаёт ритм каждого и считает метрики. Дедуплицирует одинаковые.
 * variants[i] = {targetBlock, label, schedule, stats, warnings, overtime,
 *                overtimeKeys, metrics: {maxRun, overtimeDays, spread}}.
 */
export function generateVariants(config, options) {
    const pre = checkFeasibility(config);

    if (!pre.feasible) {
        return {ok: false, errors: pre.errors, variants: []};
    }

    const dates = getMonthDates(config.year, config.month);
    const sets = config.employees.map(unavailableSet);
    const employees = config.employees;
    const X = config.maxConsecutive;
    const restarts = (options && options.restarts) || 12;
    // По умолчанию считаем месяц частью бесконечного цикла (чистые метки ритма).
    const trimEdges = !(options && options.trimEdges === false);

    const makeVariant = (schedule, targetBlock, balanced) => {
        const report = analyzeOvertime(schedule, employees, X);
        const desc = describePattern(schedule, employees, trimEdges);
        const stats = computeStats(schedule, employees);

        return {
            targetBlock,
            balanced: !!balanced,
            label: desc.label,
            schedule,
            stats,
            warnings: buildOvertimeWarnings(report),
            overtime: report.offenders,
            overtimeKeys: report.keys,
            metrics: {
                maxRun: desc.maxRun,
                overtimeDays: report.overtimeDays,
                spread: stats.spread,
            },
        };
    };

    const candidates = [];

    // Рекомендуемый: сбалансированный график (жадность + дораспределение).
    candidates.push(makeVariant(generateSchedule(config).schedule, null, true));

    // Ритмы по целевой длине блока.
    for (let L = 1; L <= X && L <= 6; L++) {
        let best = null;
        let bestOt = Infinity;

        for (let r = 0; r < restarts; r++) {
            const pass = blockPass(config, dates, sets, L, r + 1);
            const report = analyzeOvertime(pass.schedule, employees, X);

            if (report.overtimeDays < bestOt) {
                bestOt = report.overtimeDays;
                best = pass.schedule;
            }

            if (report.overtimeDays === 0) {
                break;
            }
        }

        candidates.push(makeVariant(best, L, false));
    }

    // Один ритм = одна карточка: оставляем лучший по (переработка, разброс, макс.серия).
    const better = (a, b) =>
        a.metrics.overtimeDays - b.metrics.overtimeDays ||
        a.metrics.spread - b.metrics.spread ||
        a.metrics.maxRun - b.metrics.maxRun;
    const byLabel = new Map();

    for (const v of candidates) {
        const cur = byLabel.get(v.label);

        if (!cur || better(v, cur) < 0) {
            byLabel.set(v.label, v);
        }
    }

    const variants = [...byLabel.values()].sort(better);

    return {ok: true, variants};
}
