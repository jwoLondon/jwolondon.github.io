import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import postcss from 'rollup-plugin-postcss'; // For CSS imports

export default {
  input: 'src/references.js',
  output: {
    file: 'dist/references.js',
    format: 'esm',
    sourcemap: true
  },
  plugins: [
    // Let Rollup find `@citation-js/core`, `citeproc`, `@observablehq/inputs`, etc.
    resolve({ browser: true }),

    // Convert any CommonJS modules to ES modules
    commonjs(),

    // bundle any CSS
    postcss({
      inject:  true,     // inject <style> tags
      minimize: true
    })
  ]
};