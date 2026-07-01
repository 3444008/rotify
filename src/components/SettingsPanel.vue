<script setup>
import {reactive} from 'vue';
import {
    state, monthDates, MONTH_NAMES,
    colorOf, isOff, toggleOff, dayNum,
    addEmployee, removeEmployee, reset, generate,
} from '../store.js';

// Какие блоки "недоступные дни" развёрнуты (только для UI, не сохраняется).
const open = reactive({});

const toggleDays = (id) => {
    open[id] = !open[id];
};

// Сколько недоступных дней у сотрудника в выбранном месяце.
function offCount(emp) {
    const set = new Set(monthDates.value);

    return emp.unavailable.filter((d) => set.has(d)).length;
}
</script>

<template>
    <aside class="panel panel--settings no-print" aria-label="Настройки">
        <section class="block">
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">Человек на смене</span>
                    <input class="input" type="number" min="1" step="1"
                           v-model.number="state.requiredPerDay">
                </label>
                <label class="field">
                    <span class="field-label">Дней подряд макс.</span>
                    <input class="input" type="number" min="1" step="1"
                           v-model.number="state.maxConsecutive">
                </label>
            </div>
        </section>

        <section class="block">
            <div class="grid-2">
                <label class="field">
                    <span class="field-label">Месяц</span>
                    <select class="input" v-model.number="state.month">
                        <option v-for="(m, i) in MONTH_NAMES" :key="i" :value="i">{{ m }}</option>
                    </select>
                </label>
                <label class="field">
                    <span class="field-label">Год</span>
                    <input class="input" type="number" min="2000" max="2100" step="1"
                           v-model.number="state.year">
                </label>
            </div>
        </section>

        <section class="block">
            <h2 class="block-title">
                <span>Сотрудники</span>
                <span class="count-pill">{{ state.employees.length }}</span>
            </h2>

            <ul class="roster">
                <li class="roster-item" v-for="emp in state.employees" :key="emp.id">
                    <div class="roster-head">
                        <span class="swatch" :style="{background: colorOf(emp.id)}"></span>
                        <input class="input roster-name" type="text"
                               placeholder="Имя" v-model="emp.name">
                        <button class="icon-btn" title="Удалить"
                                :disabled="state.employees.length <= 1"
                                @click="removeEmployee(emp.id)">&times;</button>
                    </div>

                    <div class="offdays">
                        <button type="button" class="offdays-toggle"
                                :aria-expanded="!!open[emp.id]"
                                @click="toggleDays(emp.id)">
                            <span class="offdays-label">Недоступные дни</span>
                            <span class="offdays-badge" v-if="offCount(emp)">{{ offCount(emp) }}</span>
                            <span class="offdays-caret" :class="{'is-open': open[emp.id]}">▾</span>
                        </button>
                        <div class="offdays-grid" v-show="open[emp.id]">
                            <button v-for="d in monthDates" :key="d"
                                    class="offday" :class="{'is-off': isOff(emp, d)}"
                                    :aria-pressed="isOff(emp, d)"
                                    @click="toggleOff(emp, d)">{{ dayNum(d) }}</button>
                        </div>
                    </div>
                </li>
            </ul>

            <div class="block-actions">
                <button class="btn btn-line" @click="addEmployee">+ Сотрудник</button>
                <button class="btn btn-ghost" @click="reset">Сбросить всё</button>
            </div>
        </section>

        <div class="generate-bar">
            <label class="option" title="График продолжается за границами месяца - краевые серии не считаются обрывами, ритм выглядит ровнее">
                <input type="checkbox" v-model="state.continuous" @change="generate">
                <span>Учитывать соседние месяцы</span>
            </label>

            <button class="btn btn-solid btn-generate"
                    :disabled="state.generating"
                    @click="generate">
                <span v-if="state.generating" class="spinner" aria-hidden="true"></span>
                {{ state.generating ? 'Генерация...' : 'Сгенерировать график' }}
            </button>
            <p class="generate-hint" v-if="state.stale && !state.generating">
                Параметры изменились - нажмите, чтобы пересобрать.
            </p>
        </div>
    </aside>
</template>
