// @ts-check
import { basename, dirname, join } from 'node:path'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import copy from 'rollup-plugin-copy'
import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'
import json from '@rollup/plugin-json'
import { defineConfig } from 'rollup'
import fs from 'fs-extra'
import fg from 'fast-glob'
import { wasmPlugin } from './build/wasm.mjs'

const entries = [
  'src/index.ts',
  'src/core.ts',
  'src/types.ts',
  'src/themes.ts',
  'src/languages.ts',
  'src/wasm.ts',
]

const plugins = [
  esbuild(),
  nodeResolve(),
  commonjs(),
  json({
    namedExports: false,
    preferConst: true,
    compact: true,
  }),
  wasmPlugin,
]

export default defineConfig([
  {
    input: entries,
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].mjs',
      chunkFileNames: (f) => {
        if (f.moduleIds.some(i => i.match(/[\\\/]languages[\\\/]/)))
          return `languages/${f.name.replace('.tmLanguage', '')}.mjs`
        else if (f.moduleIds.some(i => i.match(/[\\\/]themes[\\\/]/)))
          return 'themes/[name].mjs'
        else if (f.name === 'onig')
          return 'onig.mjs'
        return 'chunks/[name].mjs'
      },
    },
    plugins: [
      ...plugins,
    ],
  },
  {
    input: entries,
    output: {
      dir: 'dist',
      format: 'esm',
      chunkFileNames: 'types/[name].d.mts',
      entryFileNames: f => `${f.name.replace(/src[\\\/]/, '')}.d.mts`,
    },
    plugins: [
      dts({
        respectExternal: true,
      }),
      copy({
        targets: [{ src: './node_modules/vscode-oniguruma/release/onig.wasm', dest: 'dist' }],
      }),
      {
        name: 'post',
        async buildEnd() {
          await fs.writeFile('dist/onig.d.ts', 'declare const binary: ArrayBuffer; export default binary;', 'utf-8')
          const langs = await fg('dist/languages/*.mjs', { absolute: true })
          await Promise.all(
            langs.map(file => fs.writeFile(
              join(dirname(file), `${basename(file, '.mjs')}.d.mts`),
              'import { LanguageRegistration } from \'../types.mjs\';declare const reg: LanguageRegistration;export default reg',
              'utf-8',
            )),
          )
          const themes = await fg('dist/themes/*.mjs', { absolute: true })
          await Promise.all(
            themes.map(file => fs.writeFile(
              join(dirname(file), `${basename(file, '.mjs')}.d.mts`),
              'import { ThemeRegisterationRaw } from \'../types.mjs\';declare const reg: ThemeRegisterationRaw;export default reg',
              'utf-8',
            )),
          )
        },
      },
    ],
    onwarn: (warning, warn) => {
      if (!/Circular/.test(warning.message))
        warn(warning)
    },
  },
])
