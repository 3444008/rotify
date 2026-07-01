<script setup>
import {ref} from 'vue';
import {state} from './store.js';
import SettingsPanel from './components/SettingsPanel.vue';
import SchedulePanel from './components/SchedulePanel.vue';
import HelpModal from './components/HelpModal.vue';

const helpOpen = ref(false);
</script>

<template>
    <div :data-tab="state.activeTab">
        <header class="masthead no-print">
            <div class="masthead-brand">
                <span class="masthead-mark">R</span>
                <div>
                    <h1 class="masthead-title">Rotify</h1>
                    <p class="masthead-tagline">табель смен на месяц</p>
                </div>
            </div>

            <div class="masthead-right">
                <nav class="tabbar" role="tablist">
                    <button
                        class="tab" role="tab"
                        :aria-selected="state.activeTab === 'settings'"
                        :class="{'is-active': state.activeTab === 'settings'}"
                        @click="state.activeTab = 'settings'"
                    >Настройки</button>
                    <button
                        class="tab" role="tab"
                        :aria-selected="state.activeTab === 'schedule'"
                        :class="{'is-active': state.activeTab === 'schedule'}"
                        @click="state.activeTab = 'schedule'"
                    >График</button>
                </nav>

                <button class="btn-help" @click="helpOpen = true">
                    <span class="btn-help-icon" aria-hidden="true">?</span>
                    <span class="btn-help-text">Помощь</span>
                </button>
            </div>
        </header>

        <HelpModal :open="helpOpen" @close="helpOpen = false" />

        <div class="layout">
            <SettingsPanel />
            <SchedulePanel />
        </div>
    </div>
</template>
