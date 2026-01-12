#!/usr/bin/node
import './load-dot-env-variables.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { spawn } from 'node:child_process';
import { WebSocketServer as WSServer } from 'ws';
import { createServer, createLogger } from 'vite';
import esbuild from 'esbuild';
import chokidar from 'chokidar';
import nativeNodeModulesPlugin from './esbuild-native-node-modules-plugin.mjs';
import { node } from './electron-vendors.mjs';

const rootFolderPath = fileURLToPath(new URL('..', import.meta.url));
const outFolderPath = path.resolve(rootFolderPath, 'out');
const srcFolderPath = path.resolve(rootFolderPath, 'src');

const devLogger = createLogger('info', {
  prefix: '[dev]',
});

const commonDefine = {
  IS_PRODUCTION: 'false',
  IS_DEV: 'true',
};

async function buildAndWatchRendererProcessBundle() {
  /** @type {import('vite').InlineConfig} */
  const serverConfig = {
    mode: 'development',
    server: {
      port: 5173, // Porta do Vite dev server
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3000',
          ws: true,
        },
      },
    },
    build: {
      emptyOutDir: false,
      sourcemap: true,
      watch: {},
    },
    logLevel: 'warn',
    configFile: path.join(rootFolderPath, 'vite.config.mts'),
    define: {
      ...commonDefine,
      REACT_STRICT_MODE_ENABLED: process.env.REACT_STRICT_MODE_ENABLED ?? false,
    },
  };
  const devServer = await createServer(serverConfig);
  await devServer.listen();
  const { port } = devServer.config.server;
  process.env.VITE_DEV_SERVER_URL = `http://localhost:${port}/`;
  devLogger.info(`Vite dev server listening on http://localhost:${port}/`, { timestamp: true });
}

// Plugin to resolve csdm alias and mark npm packages as external
const markNpmPackagesAsExternal = {
  name: 'mark-npm-packages-as-external',
  setup(build) {
    // First, resolve csdm alias - this must run before the general npm package filter
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

async function buildServerProcessBundle() {
  const result = await esbuild.build({
    entryPoints: [path.join(srcFolderPath, 'server/start-server.ts')],
    outfile: path.join(outFolderPath, 'server.js'),
    bundle: true,
    sourcemap: 'linked',
    platform: 'node',
    format: 'esm', // Use ESM format to support import.meta.url
    target: `node${node}`,
    metafile: true,
    external: [
      'pg-native',
      '@aws-sdk/client-s3', // the unzipper module has it as a dev dependency
    ],
    define: {
      ...commonDefine,
      'process.env.STEAM_API_KEYS': `"${process.env.STEAM_API_KEYS}"`,
    },
    alias: {
      // Force fdir to use the CJS version to avoid createRequire(import.meta.url) not working
      fdir: './node_modules/fdir/dist/index.cjs',
      // csdm alias is handled by the markNpmPackagesAsExternal plugin
    },
    plugins: [nativeNodeModulesPlugin, markNpmPackagesAsExternal],
  });

  const files = Object.keys(result.metafile.inputs);
  return files;
}



async function buildMainProcessBundles() {
  const serverFiles = await buildServerProcessBundle();
  const files = [...new Set([...serverFiles])];

  return files;
}

/**
 * We don't use the esbuild watch feature because (as of version 0.12.9) it watches for the whole folder tree,
 * even parent folders.
 * Related issue https://github.com/evanw/esbuild/issues/1113
 * Instead we use chokidar to rebuild bundles when files change.
 */
async function buildAndWatchMainProcessBundles() {
  const files = await buildMainProcessBundles();
  const watcher = chokidar.watch(files);
  watcher.on('change', async () => {
    try {
      await buildMainProcessBundles();
    } catch (error) {
      // Ignore errors during watch
    }
  });
}

async function assertWebSocketServerIsAvailable() {
  const port = 4574;
  return new Promise((resolve) => {
    const server = new WSServer({
      port,
    });

    server.on('error', (error) => {
      if (error.code === 'EACCES') {
        console.error(`You don't have permission to run the WebSocket server on port ${port}.`);
      }
      if (error.code === 'EADDRINUSE') {
        console.error(
          `A WebSocket server is already running on port ${port}. Please make sure to quit all running CS:DM application and retry.`,
        );
      } else {
        console.error(error);
      }
      process.exit(1);
    });

    server.on('listening', () => {
      server.close();
      return resolve();
    });
  });
}

let httpServerProcess = null;

async function startHttpServer() {
  const serverPath = path.join(outFolderPath, 'server.js');
  
  // Verificar se o servidor foi buildado
  if (!(await fs.pathExists(serverPath))) {
    devLogger.warn('Server not built yet, building...', { timestamp: true });
    await buildMainProcessBundles();
  }

  // Iniciar servidor HTTP em processo separado
  httpServerProcess = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PROCESS_NAME: 'server',
    },
  });

  httpServerProcess.on('error', (error) => {
    devLogger.error('Failed to start HTTP server:', error, { timestamp: true });
  });

  httpServerProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      devLogger.error(`HTTP server exited with code ${code}`, { timestamp: true });
    }
  });

  return httpServerProcess;
}

try {
  await fs.ensureDir(outFolderPath);
  await assertWebSocketServerIsAvailable();

  // Buildar bundles primeiro
  await buildMainProcessBundles();
  
  // Iniciar servidor HTTP
  const httpServerProcess = await startHttpServer();
  
  // Aguardar um pouco para o servidor iniciar
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Iniciar Vite dev server
  await buildAndWatchRendererProcessBundle();
  
  devLogger.info('Development environment ready!', { timestamp: true });
  devLogger.info('  - HTTP Server: http://localhost:3000', { timestamp: true });
  devLogger.info('  - Vite Dev Server: http://localhost:5173', { timestamp: true });
  devLogger.info('  - WebSocket Server: ws://localhost:4574', { timestamp: true });
  devLogger.info('Open http://localhost:5173 in your browser.', { timestamp: true });

  process.on('SIGINT', () => {
    if (httpServerProcess) {
      httpServerProcess.kill();
    }
    process.exit(0);
  });
} catch (error) {
  devLogger.error(error, { timestamp: true });
  process.exit(1);
}

process.on('SIGINT', () => {
  process.exit(0);
});
