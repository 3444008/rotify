/*
 * Rotify - экспорт графика в PDF (jsPDF, векторная отрисовка).
 *
 * Почему свой рендер, а не браузерная печать: работает одинаково на всех
 * устройствах, включая iOS/Chrome-iOS, где window.print() ненадёжен.
 * Стандартные шрифты jsPDF без кириллицы, поэтому встраиваем subset PT Sans.
 *
 * data = {
 *   title, subtitle, weekdays: string[],
 *   weeks,                       // Scheduler.buildCalendarMatrix(...)
 *   employees: [{id, name}],
 *   stats: {byEmployee, spread, min, max},
 *   nameOf: (id) => string,
 *   colorOf: (id) => '#rrggbb',
 * }
 */

import {jsPDF} from 'jspdf';
import {PTSANS_REGULAR_B64} from './pdf-font.js';

const FONT = 'PTSans';

/** '#rrggbb' -> [r, g, b]. */
function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3
        ? h.split('').map((c) => c + c).join('')
        : h;
    const n = parseInt(full, 16);

    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Обрезает текст до ширины maxW (в текущих единицах), добавляя '…'. */
function fitText(doc, text, maxW) {
    if (doc.getTextWidth(text) <= maxW) {
        return text;
    }

    let s = text;

    while (s.length > 1 && doc.getTextWidth(`${s}…`) > maxW) {
        s = s.slice(0, -1);
    }

    return `${s}…`;
}

/** Регистрирует встроенный кириллический шрифт в документе. */
function registerFont(doc) {
    doc.addFileToVFS('PTSans.ttf', PTSANS_REGULAR_B64);
    doc.addFont('PTSans.ttf', FONT, 'normal');
    doc.setFont(FONT, 'normal');
}

/**
 * Строит PDF-документ и возвращает экземпляр jsPDF (без сохранения).
 * Вынесено отдельно, чтобы можно было тестировать вывод в Node.
 */
export function buildSchedulePdf(data) {
    const doc = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});

    registerFont(doc);

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentW = pageW - margin * 2;
    const colW = contentW / 7;

    const ink = [26, 29, 33];
    const soft = [110, 116, 128];
    const line = [210, 214, 220];
    const weekendFill = [244, 245, 247];

    // ---- Заголовок ----
    let y = margin;

    doc.setTextColor(...ink);
    doc.setFontSize(18);
    doc.text(data.title, margin, y + 5);

    if (data.subtitle) {
        doc.setFontSize(9);
        doc.setTextColor(...soft);
        doc.text(data.subtitle, margin, y + 11);
    }

    y += 16;

    // ---- Шапка дней недели ----
    doc.setFontSize(8);
    doc.setTextColor(...soft);
    data.weekdays.forEach((w, i) => {
        doc.text(w.toUpperCase(), margin + i * colW + 1.5, y);
    });
    y += 3;

    // ---- Сетка календаря ----
    const weeks = data.weeks || [];
    const weeksN = Math.max(1, weeks.length);
    // Резерв под блок нагрузки внизу.
    const ledgerRows = Math.ceil((data.employees.length + 1) / 3);
    const ledgerH = 8 + ledgerRows * 5.5;
    const availH = pageH - margin - y - ledgerH - 6;
    const rowH = Math.max(15, Math.min(32, availH / weeksN));

    const dayNumH = 4.6;
    const lineH = 4;
    const maxLines = Math.max(1, Math.floor((rowH - dayNumH - 1.5) / lineH));

    weeks.forEach((week, wi) => {
        const cy = y + wi * rowH;

        week.forEach((cell, ci) => {
            const cx = margin + ci * colW;

            if (!cell) {
                return;
            }

            // Фон выходного и рамка.
            if (cell.isWeekend) {
                doc.setFillColor(...weekendFill);
                doc.rect(cx, cy, colW, rowH, 'F');
            }

            doc.setDrawColor(...line);
            doc.setLineWidth(0.2);
            doc.rect(cx, cy, colW, rowH);

            // Номер дня.
            doc.setFontSize(8);
            doc.setTextColor(...soft);
            doc.text(String(cell.day), cx + 1.6, cy + dayNumH);

            // Сотрудники: цветной квадрат + имя.
            doc.setFontSize(8);
            const shown = cell.workers.slice(0, maxLines);

            shown.forEach((id, li) => {
                const ly = cy + dayNumH + 3 + li * lineH;
                const rgb = hexToRgb(data.colorOf(id));

                doc.setFillColor(...rgb);
                doc.rect(cx + 1.6, ly - 2.2, 2, 2, 'F');
                doc.setTextColor(...ink);
                doc.text(fitText(doc, data.nameOf(id), colW - 6.5), cx + 4.6, ly);
            });

            if (cell.workers.length > maxLines) {
                const extra = cell.workers.length - maxLines;
                const ly = cy + dayNumH + 3 + maxLines * lineH;

                doc.setTextColor(...soft);
                doc.text(`+${extra}`, cx + 4.6, ly);
            }
        });
    });

    // ---- Блок нагрузки ----
    let ly = y + weeksN * rowH + 8;

    doc.setFontSize(9);
    doc.setTextColor(...soft);
    doc.text(`Нагрузка · разброс ${data.stats.spread}`, margin, ly);
    ly += 5;

    doc.setFontSize(9);
    const perRow = 3;
    const cellLW = contentW / perRow;

    data.employees.forEach((emp, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const ex = margin + col * cellLW;
        const ey = ly + row * 5.5;
        const rgb = hexToRgb(data.colorOf(emp.id));

        doc.setFillColor(...rgb);
        doc.rect(ex, ey - 2.4, 2.4, 2.4, 'F');
        doc.setTextColor(...ink);
        const count = data.stats.byEmployee[emp.id] || 0;
        const label = fitText(doc, data.nameOf(emp.id), cellLW - 20);

        doc.text(label, ex + 4, ey);
        doc.setTextColor(...soft);
        doc.text(`${count} смен`, ex + cellLW - 18, ey);
    });

    return doc;
}

/** Строит и сохраняет PDF (браузер). filename без расширения. */
export function downloadSchedulePdf(data, filename) {
    const doc = buildSchedulePdf(data);

    doc.save(`${filename || 'rotify'}.pdf`);
}
