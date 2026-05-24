import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import JavaScriptObfuscator from 'vite-plugin-javascript-obfuscator'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    mode === 'production' &&
      JavaScriptObfuscator({
        compact: true,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        renameGlobals: false,
        selfDefending: true,
        debugProtection: false,
      }),
  ].filter(Boolean),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-core';
          }
          if (id.includes('node_modules/echarts')) return 'vendor-echarts';
          if (id.includes('node_modules/mermaid')) return 'vendor-mermaid';
          if (id.includes('node_modules/@xyflow')) return 'vendor-xyflow';
          if (id.includes('node_modules/katex')) return 'vendor-katex';
          if (id.includes('node_modules/@ant-design') || id.includes('node_modules/antd')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.VITE_DEV_PORT || '5176'),
  },
}));