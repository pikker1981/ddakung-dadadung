import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig({build:{outDir:'dist',emptyOutDir:true,rollupOptions:{input:{main:resolve('index.html'),source:resolve('score-source.html')}}}});
