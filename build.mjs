import { build } from 'esbuild';

await Promise.all([
    // ESM bundle for modern imports
    build({
        entryPoints: ['src/references.js'],
        bundle: true,
        format: 'esm',
        outfile: 'docs/dist/references.mjs',
        target: ['es2020'],
        sourcemap: true,
        minify: true,
    }),

    // UMD/IIFE bundle for <script> usage (attaches to a global)
    build({
        entryPoints: ['src/references.js'],
        bundle: true,
        format: 'iife',
        globalName: 'RefsModule',
        outfile: 'docs/dist/references.umd.js',
        target: ['es2020'],
        sourcemap: true,
        minify: true,
    })
]);