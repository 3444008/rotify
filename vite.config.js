import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    // Относительная база - приложение можно открыть из любой папки/поддиректории.
    base: './',
    plugins: [vue()],
});
