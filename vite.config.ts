import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/scarlett-first-steps/',plugins:[react()],build:{outDir:'docs',emptyOutDir:true}});
