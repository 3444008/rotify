// @vitest-environment happy-dom
import {describe, it, expect, beforeEach} from 'vitest';
import {mount} from '@vue/test-utils';
import App from '../src/App.vue';
import {init, generate, state} from '../src/store.js';

describe('App - монтирование', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('строит варианты и рендерит календарь через стор', async () => {
        init();
        await generate();
        const wrapper = mount(App);

        await wrapper.vm.$nextTick();

        // Стор по умолчанию: 3 сотрудника, R=2, X=3 -> варианты строятся.
        expect(state.variants.length).toBeGreaterThan(0);

        // Обе панели присутствуют.
        expect(wrapper.find('.panel--settings').exists()).toBe(true);
        expect(wrapper.find('.panel--schedule').exists()).toBe(true);

        // Календарь отрисован, есть заполненные ячейки и плашки сотрудников.
        expect(wrapper.findAll('.cal-cell').length).toBeGreaterThan(28);
        expect(wrapper.findAll('.chip').length).toBeGreaterThan(0);

        // Кнопка экспорта PDF активна.
        const pdfBtn = wrapper.find('.sheet-actions .btn-solid');

        expect(pdfBtn.exists()).toBe(true);
        expect(pdfBtn.attributes('disabled')).toBeUndefined();
    });

    it('показывает карточки вариантов, переключение меняет выбранный', async () => {
        init();
        await generate();
        const wrapper = mount(App);

        await wrapper.vm.$nextTick();

        const cards = wrapper.findAll('.variant');

        // Для дефолтной конфигурации ритмов больше одного.
        expect(cards.length).toBeGreaterThan(1);

        await cards[1].trigger('click');
        expect(state.selected).toBe(1);
    });

    it('блок недоступных дней свёрнут по умолчанию и раскрывается по клику', async () => {
        init();
        await generate();
        const wrapper = mount(App);

        await wrapper.vm.$nextTick();

        expect(wrapper.find('.offdays-grid').exists()).toBe(true);

        const toggle = wrapper.find('.offdays-toggle');

        expect(toggle.attributes('aria-expanded')).toBe('false');

        await toggle.trigger('click');
        expect(wrapper.find('.offdays-toggle').attributes('aria-expanded')).toBe('true');
    });

    it('кнопка «Помощь» открывает модалку', async () => {
        init();
        await generate();
        const wrapper = mount(App, {attachTo: document.body});

        await wrapper.vm.$nextTick();
        expect(document.querySelector('.modal')).toBeNull();

        await wrapper.find('.btn-help').trigger('click');
        await wrapper.vm.$nextTick();
        expect(document.querySelector('.modal')).not.toBeNull();

        wrapper.unmount();
    });

    it('переключение вкладки меняет data-tab', async () => {
        init();
        await generate();
        const wrapper = mount(App);

        await wrapper.vm.$nextTick();

        const tabs = wrapper.findAll('.tab');

        await tabs[1].trigger('click');
        expect(wrapper.find('[data-tab="schedule"]').exists()).toBe(true);
    });
});
