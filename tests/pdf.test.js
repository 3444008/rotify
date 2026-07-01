import {describe, it, expect} from 'vitest';
import {buildSchedulePdf} from '../src/lib/pdf.js';
import {generateSchedule, buildCalendarMatrix} from '../src/lib/scheduler.js';

const employees = [
    {id: 'e0', name: 'Пётр'},
    {id: 'e1', name: 'Анна'},
    {id: 'e2', name: 'Олег'},
];

function makeData() {
    const config = {
        employees: employees.map((e) => ({...e, unavailable: []})),
        requiredPerDay: 2,
        maxConsecutive: 3,
        year: 2026,
        month: 6,
    };
    const res = generateSchedule(config);
    const colors = {e0: '#059669', e1: '#2563eb', e2: '#d97706'};

    return {
        title: 'Июль 2026',
        subtitle: 'Смена: 2 чел · не более 3 дней подряд',
        weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        weeks: buildCalendarMatrix(res.schedule),
        employees,
        stats: res.stats,
        nameOf: (id) => employees.find((e) => e.id === id).name,
        colorOf: (id) => colors[id],
    };
}

describe('buildSchedulePdf', () => {
    it('строит валидный PDF с кириллицей без ошибок', () => {
        const doc = buildSchedulePdf(makeData());
        const buf = new Uint8Array(doc.output('arraybuffer'));
        const header = String.fromCharCode(...buf.slice(0, 5));

        expect(header).toBe('%PDF-');
        // Непустой документ разумного размера (встроен шрифт).
        expect(buf.length).toBeGreaterThan(10000);
    });

    it('регистрирует встроенный шрифт PTSans', () => {
        const doc = buildSchedulePdf(makeData());
        const fonts = doc.getFontList();

        expect(Object.keys(fonts)).toContain('PTSans');
    });
});
