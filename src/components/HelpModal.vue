<script setup>
import {onMounted, onUnmounted} from 'vue';

const props = defineProps({open: Boolean});
const emit = defineEmits(['close']);

function onKey(e) {
    if (e.key === 'Escape' && props.open) {
        emit('close');
    }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

const steps = [
    {
        t: 'Добавьте сотрудников',
        d: 'В разделе «Сотрудники» задайте имена. У каждого можно раскрыть ' +
            '«Недоступные дни» и отметить отгулы/отпуск - алгоритм их обойдёт.',
    },
    {
        t: 'Задайте параметры',
        d: 'Человек на смене - сколько людей нужно каждый день. Дней подряд макс - ' +
            'верхняя граница рабочих дней без перерыва. Выберите месяц и год.',
    },
    {
        t: 'Сгенерируйте график',
        d: 'Нажмите «Сгенерировать график». Появится несколько вариантов с разным ' +
            'ритмом - выберите подходящий карточкой сверху.',
    },
    {
        t: 'Смотрите метрики',
        d: 'У каждого варианта: макс подряд, переработка и разброс нагрузки. ' +
            '★ рекомендуемый - самый сбалансированный.',
    },
    {
        t: 'Сохраните',
        d: 'Кнопка «Скачать PDF» отдаёт файл (удобно на телефоне), «Печать» - ' +
            'выводит только календарь.',
    },
];
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div class="modal-backdrop no-print" v-if="open" @click.self="emit('close')">
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
                    <button class="modal-close" aria-label="Закрыть" @click="emit('close')">
                        &times;
                    </button>

                    <p class="modal-eyebrow">Rotify</p>
                    <h2 class="modal-title" id="help-title">Как составить график</h2>

                    <ol class="help-steps">
                        <li class="help-step" v-for="(s, i) in steps" :key="i">
                            <span class="help-num">{{ i + 1 }}</span>
                            <div>
                                <p class="help-step-title">{{ s.t }}</p>
                                <p class="help-step-text">{{ s.d }}</p>
                            </div>
                        </li>
                    </ol>

                    <div class="help-legend">
                        <p class="help-legend-title">Подсказки</p>
                        <ul>
                            <li>
                                <span class="chip chip-demo is-overtime">Имя ⚠</span>
                                - переработка: лимит «дней подряд» соблюсти нельзя
                                (например, кто-то в отпуске), эти смены помечены.
                            </li>
                            <li>
                                Галочка «Учитывать соседние месяцы» делает ритм ровнее,
                                считая, что график продолжается за границами месяца.
                            </li>
                            <li>Цвет плашки закреплён за сотрудником - видно его по всему месяцу.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>
