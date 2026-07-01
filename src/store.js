/*
 * Rotify - реактивный стор приложения (composable-стиль, без Pinia).
 * Держит состояние формы, по кнопке строит НЕСКОЛЬКО вариантов графика с
 * разным ритмом (lib/scheduler.generateVariants), даёт выбрать вариант,
 * связывает хранилище (lib/storage) и экспорт (lib/pdf).
 */

import {reactive, computed, watch} from 'vue';
import * as Scheduler from './lib/scheduler.js';
import * as Storage from './lib/storage.js';

// Приглушённая, но различимая палитра - по цвету видно человека в календаре.
const PALETTE = [
    '#059669', '#2563eb', '#d97706', '#7c3aed',
    '#dc2626', '#0891b2', '#65a30d', '#db2777',
];

export const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

let idCounter = 0;
const nextId = () => `emp-${++idCounter}`;
const makeEmployee = (name) => ({id: nextId(), name, unavailable: []});

const now = new Date();

export const state = reactive({
    employees: [],
    requiredPerDay: 2,
    maxConsecutive: 3,
    month: now.getMonth(),
    year: now.getFullYear(),
    activeTab: 'settings',
    continuous: true,   // считать месяц частью бесконечного цикла (края не обрывы)
    variants: [],       // [{label, balanced, schedule, stats, metrics, warnings, overtimeKeys, ...}]
    selected: 0,
    errors: [],         // жёсткие ошибки выполнимости (обновляются на лету)
    generating: false,
    stale: false,       // параметры менялись после последней генерации
});

// ---- Производные значения ----
export const monthDates = computed(() => Scheduler.getMonthDates(state.year, state.month));
export const monthTitle = computed(() => `${MONTH_NAMES[state.month]} ${state.year}`);
export const current = computed(() => state.variants[state.selected] || null);
export const hasResult = computed(() => state.variants.length > 0);
export const warnings = computed(() => (current.value ? current.value.warnings : []));
export const weeks = computed(() => (
    current.value ? Scheduler.buildCalendarMatrix(current.value.schedule) : []
));

// Плоский список дней для календаря (одна разметка - reflow сеткой/списком).
export const days = computed(() => {
    if (!current.value) {
        return [];
    }

    return current.value.schedule.map((d) => ({
        date: d.date,
        day: Number(d.date.split('-')[2]),
        dow: d.dow,
        isWeekend: d.dow === 0 || d.dow === 6,
        weekday: WEEKDAY_NAMES[(d.dow + 6) % 7],
        workers: d.workers,
    }));
});

// Колонка первого дня в сетке (понедельник = 1).
export const firstColumn = computed(() =>
    (days.value.length ? ((days.value[0].dow + 6) % 7) + 1 : 1));
export const maxShift = computed(() => (
    current.value ? Math.max(1, current.value.stats.max) : 1
));

// ---- Справочники ----
export function colorOf(id) {
    const i = state.employees.findIndex((e) => e.id === id);

    return PALETTE[(i < 0 ? 0 : i) % PALETTE.length];
}

export function nameOf(id) {
    const e = state.employees.find((x) => x.id === id);

    return e && e.name ? e.name : 'Без имени';
}

export const dayNum = (dateStr) => Number(dateStr.split('-')[2]);

// ---- Недоступные дни ----
export const isOff = (emp, date) => emp.unavailable.includes(date);

export function toggleOff(emp, date) {
    const i = emp.unavailable.indexOf(date);

    if (i === -1) {
        emp.unavailable.push(date);
    } else {
        emp.unavailable.splice(i, 1);
    }
}

// ---- Сотрудники ----
export function addEmployee() {
    state.employees.push(makeEmployee(`Сотрудник ${state.employees.length + 1}`));
}

export function removeEmployee(id) {
    if (state.employees.length <= 1) {
        return;
    }

    state.employees = state.employees.filter((e) => e.id !== id);
}

// ---- Конфиг ----
function buildConfig() {
    return {
        employees: state.employees.map((e) => ({
            id: e.id,
            name: e.name,
            unavailable: e.unavailable.slice(),
        })),
        requiredPerDay: state.requiredPerDay,
        maxConsecutive: state.maxConsecutive,
        year: state.year,
        month: state.month,
    };
}

// ---- Выполнимость (дёшево, обновляем на лету) ----
function refreshFeasibility() {
    state.errors = Scheduler.checkFeasibility(buildConfig()).errors;
}

// ---- Генерация вариантов (по кнопке, с лоадером) ----
export async function generate() {
    refreshFeasibility();

    if (state.errors.length) {
        state.variants = [];
        state.stale = false;

        return;
    }

    state.generating = true;
    // Дать лоадеру отрисоваться перед синхронным расчётом.
    await new Promise((resolve) => setTimeout(resolve, 30));

    const res = Scheduler.generateVariants(buildConfig(), {trimEdges: state.continuous});

    state.variants = res.variants;
    state.selected = 0;
    state.stale = false;
    state.generating = false;

    if (res.variants.length) {
        Storage.saveResult({
            schedule: res.variants[0].schedule,
            stats: res.variants[0].stats,
            title: monthTitle.value,
        });
    }

    // На узком экране после генерации показываем график.
    if (window.matchMedia && window.matchMedia('(max-width: 899px)').matches) {
        state.activeTab = 'schedule';
    }
}

export function selectVariant(i) {
    if (i >= 0 && i < state.variants.length) {
        state.selected = i;
    }
}

// ---- Статистика ----
export function barStyle(id) {
    if (!current.value) {
        return {width: '0%'};
    }

    const count = current.value.stats.byEmployee[id] || 0;

    return {width: `${Math.round((count / maxShift.value) * 100)}%`, background: colorOf(id)};
}

/** Помечена ли смена (сотрудник, дата) как переработка. */
export function isOvertime(id, date) {
    const keys = current.value && current.value.overtimeKeys;

    return Array.isArray(keys) && keys.includes(`${id}|${date}`);
}

// ---- Экспорт PDF (jsPDF грузится лениво) ----
export async function downloadPdf() {
    if (!current.value) {
        return;
    }

    const {downloadSchedulePdf} = await import('./lib/pdf.js');

    const subtitle = `Смена: ${state.requiredPerDay} чел · ритм «${current.value.label}»`;

    downloadSchedulePdf({
        title: monthTitle.value,
        subtitle,
        weekdays: WEEKDAY_NAMES,
        weeks: weeks.value,
        employees: state.employees.map((e) => ({id: e.id, name: e.name})),
        stats: current.value.stats,
        nameOf,
        colorOf,
    }, `rotify-${state.year}-${String(state.month + 1).padStart(2, '0')}`);
}

export function printSchedule() {
    window.print();
}

// ---- Сохранение / сброс / восстановление ----
export function persist() {
    Storage.saveConfig(buildConfig());
}

export function reset() {
    if (!window.confirm('Сбросить все данные и настройки?')) {
        return;
    }

    Storage.clear();
    const d = new Date();

    state.employees = [
        makeEmployee('Сотрудник 1'),
        makeEmployee('Сотрудник 2'),
        makeEmployee('Сотрудник 3'),
    ];
    state.requiredPerDay = 2;
    state.maxConsecutive = 3;
    state.month = d.getMonth();
    state.year = d.getFullYear();
    state.variants = [];
    generate();
}

function restore() {
    const saved = Storage.loadConfig();

    if (!saved || !saved.employees || !saved.employees.length) {
        state.employees = [
            makeEmployee('Сотрудник 1'),
            makeEmployee('Сотрудник 2'),
            makeEmployee('Сотрудник 3'),
        ];

        return;
    }

    if (saved.requiredPerDay != null) {
        state.requiredPerDay = saved.requiredPerDay;
    }

    if (saved.maxConsecutive != null) {
        state.maxConsecutive = saved.maxConsecutive;
    }

    if (saved.year != null) {
        state.year = saved.year;
    }

    if (saved.month != null) {
        state.month = saved.month;
    }

    state.employees = saved.employees.map((e) => ({
        id: e.id,
        name: e.name,
        unavailable: (e.unavailable || []).slice(),
    }));

    state.employees.forEach((e) => {
        const n = parseInt(String(e.id).replace('emp-', ''), 10);

        if (!isNaN(n) && n > idCounter) {
            idCounter = n;
        }
    });
}

// Изменение конфигурации: сохраняем, обновляем выполнимость, помечаем "устарело".
watch(() => JSON.stringify(buildConfig()), () => {
    persist();
    refreshFeasibility();

    if (state.variants.length) {
        state.stale = true;
    }
});

export function init() {
    restore();
    refreshFeasibility();
    generate();
}
