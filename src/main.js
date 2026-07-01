import {createApp} from 'vue';
import App from './App.vue';
import {init} from './store.js';
import './styles/base.css';
import './styles/print.css';

createApp(App).mount('#app');
init();
