<script setup>
import {
    state, days, firstColumn, monthTitle, WEEKDAY_NAMES,
    current, hasResult, warnings,
    colorOf, nameOf, barStyle, isOvertime,
    selectVariant, downloadPdf, printSchedule,
} from '../store.js';
</script>

<template>
    <main class="panel panel--schedule" aria-label="График">
        <div class="sheet">
            <div class="sheet-overlay" v-if="state.generating" aria-hidden="true">
                <span class="spinner spinner-lg"></span>
            </div>

            <div class="sheet-head">
                <h2 class="sheet-title">{{ monthTitle }}</h2>
                <div class="sheet-actions no-print">
                    <button class="btn btn-solid" :disabled="!hasResult" @click="downloadPdf">
                        Скачать PDF
                    </button>
                    <button class="btn btn-line" :disabled="!hasResult" @click="printSchedule">
                        Печать
                    </button>
                </div>
            </div>

            <!-- Жёсткие ошибки выполнимости -->
            <div class="notice notice-error no-print" v-if="state.errors.length">
                <p class="notice-head">График не построить</p>
                <ul>
                    <li v-for="(e, i) in state.errors" :key="i">{{ e }}</li>
                </ul>
            </div>

            <!-- Пустое состояние -->
            <div class="empty no-print"
                 v-if="!hasResult && !state.errors.length && !state.generating">
                Нажмите «Сгенерировать график», чтобы построить варианты.
            </div>

            <!-- Выбор варианта ритма -->
            <div class="variants no-print" v-if="hasResult && state.variants.length > 1">
                <button v-for="(v, i) in state.variants" :key="i"
                        class="variant" :class="{'is-active': i === state.selected}"
                        @click="selectVariant(i)">
                    <span class="variant-title">
                        {{ v.balanced ? 'Сбалансированный' : 'Ритм ' + v.label }}
                        <span class="variant-badge" v-if="v.balanced">рекомендуемый</span>
                    </span>
                    <span class="variant-meta">
                        макс {{ v.metrics.maxRun }} подряд · переработка {{ v.metrics.overtimeDays }}
                        · разброс {{ v.metrics.spread }}
                    </span>
                </button>
            </div>

            <!-- Предупреждения выбранного варианта -->
            <div class="notice notice-warn no-print" v-if="hasResult && warnings.length">
                <ul>
                    <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
                </ul>
            </div>

            <!-- Календарь: на десктопе сетка 7 колонок, на мобиле - список по дням -->
            <div class="calendar" v-if="hasResult">
                <div class="cal-weekdays">
                    <span v-for="(w, i) in WEEKDAY_NAMES" :key="i"
                          class="cal-weekday" :class="{'is-weekend': i >= 5}">{{ w }}</span>
                </div>

                <div class="cal-grid">
                    <div v-for="(d, di) in days" :key="d.date"
                         class="cal-cell" :class="{'is-weekend': d.isWeekend}"
                         :style="di === 0 ? {gridColumnStart: firstColumn} : null">
                        <div class="cal-cell-head">
                            <span class="cal-daynum">{{ d.day }}</span>
                            <span class="cal-weekday-inline">{{ d.weekday }}</span>
                        </div>
                        <ul class="cal-shift">
                            <li v-for="id in d.workers" :key="id"
                                class="chip"
                                :class="{'is-overtime': isOvertime(id, d.date)}"
                                :title="isOvertime(id, d.date) ? 'Переработка (сверх лимита подряд)' : null"
                                :style="{'--chip': colorOf(id)}">
                                {{ nameOf(id) }}
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <!-- Статистика нагрузки -->
            <div class="ledger" v-if="hasResult">
                <h3 class="ledger-title">Нагрузка · разброс {{ current.stats.spread }}</h3>
                <ul class="ledger-list">
                    <li class="ledger-row" v-for="emp in state.employees" :key="emp.id">
                        <span class="swatch swatch-sm" :style="{background: colorOf(emp.id)}"></span>
                        <span class="ledger-name">{{ nameOf(emp.id) }}</span>
                        <span class="ledger-bar">
                            <span class="ledger-fill" :style="barStyle(emp.id)"></span>
                        </span>
                        <span class="ledger-count">{{ current.stats.byEmployee[emp.id] || 0 }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </main>
</template>
