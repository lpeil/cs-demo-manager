#!/usr/bin/node
import './load-dot-env-variables.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { build } from 'vite';
import esbuild from 'esbuild';
import nativeNodeModulesPlugin from './esbuild-native-node-modules-plugin.mjs';
import { node } from './electron-vendors.mjs';

const rootFolderPath = fileURLToPath(new URL('..', import.meta.url));
const srcFolderPath = path.resolve(rootFolderPath, 'src');
const outFolderPath = path.resolve(rootFolderPath, 'out');

const commonDefine = {
  IS_PRODUCTION: 'true',
  IS_DEV: 'false',
};

async function buildRendererProcessBundle() {
  await build({
    mode: 'production',
    build: {
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 3000,
    },
    configFile: path.join(rootFolderPath, 'vite.config.mts'),
    esbuild: {
      // Do not minify identifiers in order to have real functions name in logs that are written on the FS.
      // I didn't find a way to have logs in production builds pointing to the actual .ts/.tsx file.
      // Unfortunately the module source-map-support doesn't help here even when using the browser version.
      // It increases the bundle size but makes logs much more readable.
      // Note: Opening the DevTools console in production builds will show the original .ts/.tsx file.
      minifyIdentifiers: false,
    },
    define: {
      ...commonDefine,
      REACT_STRICT_MODE_ENABLED: false,
    },
  });
}

// Plugin to resolve csdm alias and mark npm packages as external
const markNpmPackagesAsExternal = {
  name: 'mark-npm-packages-as-external',
  setup(build) {
    // First, resolve csdm alias
    build.onResolve({ filter: /^csdm/ }, (args) => {
      const pathWithoutAlias = args.path.replace(/^csdm/, '');
      let resolvedPath = path.join(srcFolderPath, pathWithoutAlias);
      // Add .ts extension if no extension is present
      if (!path.extname(resolvedPath)) {
        resolvedPath += '.ts';
      }
      return {
        path: resolvedPath,
        namespace: 'file',
      };
    });
    
    // Then, mark all other npm packages as external
    build.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
      // Don't mark 'csdm' as external - it's already resolved above
      if (args.path.startsWith('csdm')) {
        return;
      }
      return { path: args.path, external: true };
    });
  },
};

async function buildServerBundle() {
  await esbuild.build({
    entryPoints: [path.join(srcFolderPath, 'server/start-server.ts')],
    outfile: path.join(outFolderPath, 'server.js'),
    bundle: true,
    sourcemap: 'linked',
    minify: true,
    platform: 'node',
    format: 'esm', // Use ESM format to support import.meta.url
    target: `node${node}`,
    mainFields: ['module', 'main'],
    external: [
      'pg-native',
      '@aws-sdk/client-s3', // the unzipper module has it as a dev dependency
    ],
    define: {
      ...commonDefine,
      'process.env.STEAM_API_KEYS': `"${process.env.STEAM_API_KEYS}"`,
      'process.env.FACEIT_API_KEY': `"${process.env.FACEIT_API_KEY}"`,
    },
    alias: {
      // Force fdir to use the CJS version to avoid createRequire(import.meta.url) not working
      fdir: './node_modules/fdir/dist/index.cjs',
      // csdm alias is handled by the markNpmPackagesAsExternal plugin
    },
    plugins: [nativeNodeModulesPlugin, markNpmPackagesAsExternal],
  });
}


async function buildCliBundle() {
  await esbuild.build({
    entryPoints: [path.join(srcFolderPath, 'cli/cli.ts')],
    outfile: path.join(outFolderPath, 'cli.js'),
    bundle: true,
    sourcemap: true,
    minify: true,
    platform: 'node',
    target: `node${node}`,
    mainFields: ['module', 'main'],
    define: {
      ...commonDefine,
      'process.env.STEAM_API_KEYS': `"${process.env.STEAM_API_KEYS}"`,
      'process.env.FACEIT_API_KEY': `"${process.env.FACEIT_API_KEY}"`,
    },
    external: ['pg-native', '@aws-sdk/client-s3'],
    alias: {
      // Force fdir to use the CJS version to avoid createRequire(import.meta.url) not working
      fdir: './node_modules/fdir/dist/index.cjs',
    },
    plugins: [nativeNodeModulesPlugin],
  });
}

try {
  await buildRendererProcessBundle();
  await Promise.all([buildServerBundle(), buildCliBundle()]);
} catch (error) {
  console.error(error);
  process.exit(1);
}
