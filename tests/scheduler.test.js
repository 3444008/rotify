import {describe, it, expect} from 'vitest';
import {
    getMonthDates,
    checkFeasibility,
    generateSchedule,
    generateVariants,
    computeStats,
    buildCalendarMatrix,
} from '../src/lib/scheduler.js';

const makeEmployees = (names, unavailMap) => names.map((n, i) => ({
    id: `e${i}`,
    name: n,
    unavailable: (unavailMap && unavailMap[i]) || [],
}));

/** Инварианты графика: макс. серия подряд, полнота дней, соблюдение недоступности. */
function inspect(config, schedule) {
    const R = config.requiredPerDay;
    const byId = {};

    config.employees.forEach((e) => {
        byId[e.id] = new Set(e.unavailable);
    });

    let everyDayFull = true;
    let availabilityOk = true;
    const streak = {};
    let maxStreak = 0;

    schedule.forEach((day) => {
        if (day.workers.length !== R) {
            everyDayFull = false;
        }

        const working = new Set(day.workers);

        day.workers.forEach((id) => {
            if (byId[id] && byId[id].has(day.date)) {
                availabilityOk = false;
            }
        });

        config.employees.forEach((e) => {
            if (working.has(e.id)) {
                streak[e.id] = (streak[e.id] || 0) + 1;
                maxStreak = Math.max(maxStreak, streak[e.id]);
            } else {
                streak[e.id] = 0;
            }
        });
    });

    return {maxStreak, everyDayFull, availabilityOk};
}

describe('generateSchedule - базовый', () => {
    const config = {
        employees: makeEmployees(['A', 'B', 'C']),
        requiredPerDay: 2,
        maxConsecutive: 3,
        year: 2026,
        month: 6,
    };
    const res = generateSchedule(config);

    it('строит валидный график', () => {
        expect(res.ok).toBe(true);
    });

    it('каждый день ровно R человек и 31 день', () => {
        const inv = inspect(config, res.schedule);

        expect(inv.everyDayFull).toBe(true);
        expect(res.schedule).toHaveLength(31);
    });

    it('не превышает лимит подряд и держит разброс <= 1', () => {
        const inv = inspect(config, res.schedule);

        expect(inv.maxStreak).toBeLessThanOrEqual(3);
        expect(res.stats.spread).toBeLessThanOrEqual(1);
    });
});

describe('generateSchedule - недоступность', () => {
    const offDates = ['2026-07-05', '2026-07-06', '2026-07-07'];
    const config = {
        employees: makeEmployees(['A', 'B', 'C', 'D'], {0: offDates}),
        requiredPerDay: 2,
        maxConsecutive: 3,
        year: 2026,
        month: 6,
    };
    const res = generateSchedule(config);

    it('никто не работает в свои недоступные дни', () => {
        expect(res.ok).toBe(true);
        expect(inspect(config, res.schedule).availabilityOk).toBe(true);
    });

    it('сотрудник с отгулами отсутствует в эти даты', () => {
        const violated = res.schedule.some(
            (d) => offDates.includes(d.date) && d.workers.includes('e0'),
        );

        expect(violated).toBe(false);
    });
});

describe('переработка (мягкий лимит подряд)', () => {
    it('2 человека, R=2, X=3: строит график с переработкой, не блокирует', () => {
        const config = {
            employees: makeEmployees(['A', 'B']),
            requiredPerDay: 2,
            maxConsecutive: 3,
            year: 2026,
            month: 6,
        };

        expect(checkFeasibility(config).feasible).toBe(true);

        const res = generateSchedule(config);

        expect(res.ok).toBe(true);
        expect(res.overtime.length).toBeGreaterThan(0);
        expect(res.warnings.some((w) => w.includes('Переработка'))).toBe(true);
        expect(inspect(config, res.schedule).everyDayFull).toBe(true);
    });

    it('отгулы делают лимит недостижимым: график строится + помечает переработку', () => {
        const off = ['2026-07-11', '2026-07-17', '2026-07-18', '2026-07-20'];
        const config = {
            employees: makeEmployees(['A', 'B', 'C'], {0: off}),
            requiredPerDay: 2,
            maxConsecutive: 3,
            year: 2026,
            month: 6,
        };
        const res = generateSchedule(config);
        const inv = inspect(config, res.schedule);

        expect(res.ok).toBe(true);
        expect(inv.everyDayFull).toBe(true);
        expect(inv.availabilityOk).toBe(true);
        // Переработка неизбежна, но распределена оптимально: не длиннее 4 подряд.
        expect(inv.maxStreak).toBeGreaterThan(3);
        expect(inv.maxStreak).toBeLessThanOrEqual(4);
        expect(res.overtime.length).toBeGreaterThan(0);
        expect(res.overtimeKeys.length).toBeGreaterThan(0);
        expect(res.message).not.toMatch(/попыт/i);
    });

    it('жёсткий блок остаётся: в конкретный день доступно меньше R', () => {
        const config = {
            employees: makeEmployees(['A', 'B', 'C'], {1: ['2026-07-10'], 2: ['2026-07-10']}),
            requiredPerDay: 2,
            maxConsecutive: 3,
            year: 2026,
            month: 6,
        };
        const feas = checkFeasibility(config);

        expect(feas.feasible).toBe(false);
        expect(feas.errors.some((e) => e.includes('2026-07-10'))).toBe(true);

        const res = generateSchedule(config);

        expect(res.ok).toBe(false);
        expect(res.message).not.toMatch(/попыт/i);
    });
});

describe('computeStats', () => {
    it('считает смены и разброс', () => {
        const employees = makeEmployees(['A', 'B']);
        const schedule = [
            {date: '2026-07-01', dow: 3, workers: ['e0', 'e1']},
            {date: '2026-07-02', dow: 4, workers: ['e0']},
        ];
        const stats = computeStats(schedule, employees);

        expect(stats.byEmployee.e0).toBe(2);
        expect(stats.byEmployee.e1).toBe(1);
        expect(stats.spread).toBe(1);
    });
});

describe('buildCalendarMatrix', () => {
    it('раскладывает июль 2026 с понедельника', () => {
        const res = generateSchedule({
            employees: makeEmployees(['A', 'B', 'C']),
            requiredPerDay: 2,
            maxConsecutive: 3,
            year: 2026,
            month: 6,
        });
        const weeks = buildCalendarMatrix(res.schedule);

        expect(weeks.every((w) => w.length === 7)).toBe(true);
        // 1 июля 2026 - среда => первые две ячейки пустые.
        expect(weeks[0][0]).toBeNull();
        expect(weeks[0][1]).toBeNull();
        expect(weeks[0][2].day).toBe(1);

        const totalDays = weeks.reduce(
            (acc, w) => acc + w.filter(Boolean).length, 0,
        );

        expect(totalDays).toBe(31);
    });

    it('пустой график -> []', () => {
        expect(buildCalendarMatrix([])).toEqual([]);
    });
});

describe('getMonthDates', () => {
    it('февраль 2024 (високосный) - 29 дней', () => {
        expect(getMonthDates(2024, 1)).toHaveLength(29);
    });
});

describe('generateVariants', () => {
    it('несколько ритмов с метриками, включая рекомендуемый', () => {
        const {ok, variants} = generateVariants({
            employees: makeEmployees(['A', 'B', 'C', 'D']),
            requiredPerDay: 2,
            maxConsecutive: 4,
            year: 2026,
            month: 6,
        });

        expect(ok).toBe(true);
        expect(variants.length).toBeGreaterThan(1);
        expect(variants.some((v) => v.balanced)).toBe(true);

        variants.forEach((v) => {
            expect(typeof v.label).toBe('string');
            expect(v.metrics.maxRun).toBeGreaterThan(0);
            // каждый вариант закрывает все смены и не превышает лимит без пометки
            expect(v.schedule.every((d) => d.workers.length === 2)).toBe(true);
            expect(v.metrics.maxRun).toBeLessThanOrEqual(4);
        });
    });

    it('разные варианты дают разные ритмы (метки не совпадают)', () => {
        const {variants} = generateVariants({
            employees: makeEmployees(['A', 'B', 'C', 'D']),
            requiredPerDay: 2,
            maxConsecutive: 4,
            year: 2026,
            month: 6,
        });
        const labels = variants.map((v) => v.label);

        expect(new Set(labels).size).toBe(labels.length);
    });

    it('невыполнимая конфигурация -> ok:false, вариантов нет', () => {
        const {ok, variants} = generateVariants({
            employees: makeEmployees(['A', 'B', 'C'], {1: ['2026-07-10'], 2: ['2026-07-10']}),
            requiredPerDay: 2,
            maxConsecutive: 3,
            year: 2026,
            month: 6,
        });

        expect(ok).toBe(false);
        expect(variants.length).toBe(0);
    });
});
