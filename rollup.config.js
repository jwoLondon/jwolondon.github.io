import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss'; // For CSS imports

export default {
  input: 'src/references.js',
  output: {
    file: 'docs/dist/references.js',
    format: 'esm',
    sourcemap: true
  },
  plugins: [
    // 1) Allow Rollup to import JSON files
    json(),
    // Let Rollup resolve and bundle all npm deps
    resolve({ browser: true }),
    // Convert any CommonJS modules (citeproc, etc.) to ES modules
    commonjs(),
    // Bundle any imported CSS (e.g. @observablehq/inputs styles)
    postcss({
      inject: true,     // inject <style> tags into the bundle
      minimize: true
    })
  ]
};