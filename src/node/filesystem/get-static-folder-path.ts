import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getStaticFolderPath() {
  // We are in the "out" folder in dev mode and "app.asar" when the app is packaged, so we need to go up one level.
  // In ESM, we need to use import.meta.url to get the current file path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, '..', 'static');
}
