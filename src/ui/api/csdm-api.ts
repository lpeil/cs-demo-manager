import { httpClient } from './http-client';
import type { Settings } from 'csdm/node/settings/settings';
import type { ThemeName } from 'csdm/common/types/theme-name';
import { StartupBehavior } from 'csdm/common/types/startup-behavior';
import type { AppInformation } from 'csdm/node/get-app-information';
import type { Argument } from 'csdm/common/types/argument';
import { ArgumentName } from 'csdm/common/argument/argument-name';
import type { PremierRank, Rank } from 'csdm/common/types/counter-strike';
import type { PreloadResult } from 'csdm/common/types/preload-result';
import { RendererClientMessageName } from 'csdm/server/renderer-client-message-name';
import { ErrorCode } from 'csdm/common/error-code';

// Detectar plataforma do navegador
const platform = (() => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('win')) return 'win32';
  if (userAgent.includes('mac')) return 'darwin';
  if (userAgent.includes('linux')) return 'linux';
  return 'unknown';
})() as NodeJS.Platform;

const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

// API que substitui window.csdm
export const csdmApi = {
  // Propriedades estáticas
  platform,
  isWindows,
  isMac,
  isLinux,
  unknownImageFilePath: '/images/unknown.png',
  IMAGES_FOLDER_PATH: '/images',
  ADDITIONAL_ARGUMENTS: [],

  // Logger - não disponível no navegador, usar console
  logger: {
    log: (...args: unknown[]) => console.log('[CSDM]', ...args),
    error: (...args: unknown[]) => console.error('[CSDM]', ...args),
    warn: (...args: unknown[]) => console.warn('[CSDM]', ...args),
    debug: (...args: unknown[]) => console.debug('[CSDM]', ...args),
  },

  // App Information - usar InitializeApplication que retorna settings
  getAppInformation(): Promise<AppInformation> {
    // Por enquanto, retornar informações básicas
    // TODO: Criar handler específico se necessário
    // @ts-ignore - APP_VERSION é definido pelo Vite
    const version = typeof APP_VERSION !== 'undefined' ? APP_VERSION : '3.17.1';
    return Promise.resolve({
      version,
      name: 'CS Demo Manager',
      platform,
      arch: 'x64', // Assumir x64 para web
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      osVersion: navigator.platform || 'unknown',
      electronVersion: '', // Não aplicável em web
      chromeVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || '',
    } as AppInformation);
  },

  // Startup Arguments
  getStartupArguments(): Promise<Argument[]> {
    const urlParams = new URLSearchParams(window.location.search);
    const args: Argument[] = [];

    // Ler argumentos da URL (ex: ?demoPath=/path/to/demo.dem)
    for (const [key, value] of urlParams.entries()) {
      // Tentar mapear para ArgumentName conhecido, ou usar como string
      const argumentName = Object.values(ArgumentName).includes(key as ArgumentName)
        ? (key as ArgumentName)
        : (key as unknown as ArgumentName);
      args.push({ name: argumentName, value });
    }

    return Promise.resolve(args);
  },

  clearStartupArguments(): void {
    // Limpar query params da URL
    window.history.replaceState({}, '', window.location.pathname);
  },

  // Theme
  getTheme(): Promise<ThemeName> {
    // Tentar ler do localStorage primeiro
    const stored = localStorage.getItem('csdm-theme');
    if (stored === 'light' || stored === 'dark') {
      return Promise.resolve(stored);
    }

    // Fallback: detectar preferência do sistema
    // eslint-disable-next-line lingui/no-unlocalized-strings
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return Promise.resolve('dark');
    }
    return Promise.resolve('light');
  },

  // System Startup Behavior - não aplicável em web
  getSystemStartupBehavior(): Promise<StartupBehavior> {
    return Promise.resolve(StartupBehavior.Off);
  },

  updateSystemStartupBehavior(): Promise<void> {
    // Não aplicável em web
    return Promise.resolve();
  },

  // Settings - usar InitializeApplication que retorna settings
  async parseSettingsFile(): Promise<Settings> {
    const result = await httpClient.callHandler<{ settings: Settings }>(
      RendererClientMessageName.InitializeApplication,
    );
    if (result.success && result.data) {
      return (result.data as { settings: Settings }).settings;
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings
    const errorMessage = 'success' in result && !result.success ? result.message : 'Failed to get settings';
    throw new Error(errorMessage);
  },

  async updateSettings(settings: DeepPartial<Settings>): Promise<Settings> {
    // TODO: Criar handler UpdateSettings se necessário
    // Por enquanto, fazer merge local e retornar
    const current = await this.parseSettingsFile();
    return { ...current, ...settings } as Settings;
  },

  async resetSettings(): Promise<void> {
    // Por enquanto, apenas logar - reset completo requer handler específico
    // que preserve database settings. O handler ResetSettings pode ser criado
    // no futuro se necessário.
    console.warn('resetSettings: Full reset not yet implemented via API. Database settings will be preserved.');
    // TODO: Criar handler ResetSettings no backend se necessário
    return Promise.resolve();
  },

  // Table State - usar localStorage por enquanto
  readTableState(tableName: string): Promise<unknown> {
    const stored = localStorage.getItem(`csdm-table-state-${tableName}`);
    if (stored) {
      try {
        return Promise.resolve(JSON.parse(stored));
      } catch {
        return Promise.resolve(undefined);
      }
    }
    return Promise.resolve(undefined);
  },

  writeTableState(tableName: string, columns: unknown): Promise<void> {
    localStorage.setItem(`csdm-table-state-${tableName}`, JSON.stringify(columns));
    // TODO: Sincronizar com servidor se necessário
    return Promise.resolve();
  },

  // Path utilities - TODO: Criar handler se necessário
  pathExists(): Promise<boolean> {
    // Por enquanto, assumir que sempre existe
    // TODO: Implementar verificação via API
    return Promise.resolve(true);
  },

  getPathDirectoryName(path: string): string {
    return path.substring(0, path.lastIndexOf('/') || path.lastIndexOf('\\'));
  },

  getPathBasename(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1 || path.lastIndexOf('\\') + 1);
  },

  // Images
  getDefaultPlayerAvatar(): string {
    return '/images/avatar.jpg';
  },

  getRankImageSrc(rankNumber: Rank): string {
    return `/images/ranks/${rankNumber}.png`;
  },

  getPremierRankImageSrc(rank: PremierRank): string {
    return `/images/ranks/premier-${rank}.png`;
  },

  // Images - usar endpoints diretos ou assets estáticos
  async getMapRadarBase64(mapName: string): Promise<string> {
    // Tentar carregar como asset estático primeiro
    try {
      const response = await fetch(`/images/maps/${mapName}/radar.png`);
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // Fallback
    }
    throw new Error('Failed to get map radar');
  },

  async getMapLowerRadarBase64(mapName: string): Promise<string> {
    try {
      const response = await fetch(`/images/maps/${mapName}/lower-radar.png`);
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // Fallback
    }
    throw new Error('Failed to get map lower radar');
  },

  async getMapThumbnailBase64(mapName: string): Promise<string> {
    try {
      const response = await fetch(`/images/maps/${mapName}/thumbnail.png`);
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch {
      // Fallback
    }
    throw new Error('Failed to get map thumbnail');
  },

  getCameraPreviewBase64(): Promise<string> {
    // TODO: Implementar via API
    return Promise.reject(new Error('getCameraPreviewBase64 not yet implemented'));
  },

  getImageInformation(): Promise<unknown> {
    // TODO: Implementar via API
    return Promise.resolve({});
  },

  async readImageFile(imagePath: string): Promise<ArrayBuffer> {
    const response = await fetch(`/api/images/${encodeURIComponent(imagePath)}`);
    if (!response.ok) {
      throw new Error('Failed to read image file');
    }
    return response.arrayBuffer();
  },

  // Window controls - não aplicáveis em web, implementar como no-ops
  showMainWindow(): void {
    // No-op em web
  },

  minimizeWindow(): void {
    // No-op em web
  },

  maximizeWindow(): void {
    // No-op em web
  },

  unMaximizeWindow(): void {
    // No-op em web
  },

  closeWindow(): void {
    // No-op em web
  },

  isWindowMaximized(): Promise<boolean> {
    return Promise.resolve(false); // Sempre false em web
  },

  // Event listeners - usar eventos customizados do DOM
  onWindowClose(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  },

  onWindowMaximized(): () => void {
    // No-op em web
    return () => {};
  },

  onWindowUnMaximized(): () => void {
    // No-op em web
    return () => {};
  },

  // File dialogs - usar input HTML5
  async showOpenDialog(options: unknown): Promise<{ canceled: boolean; filePaths: string[] }> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      const dialogOptions = (options as { properties?: string[] }) || {};
      input.multiple = dialogOptions.properties?.includes('multiSelections') || false;

      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          const filePaths = Array.from(files, (f) => f.name);
          resolve({ canceled: false, filePaths });
        } else {
          resolve({ canceled: true, filePaths: [] });
        }
      };

      input.oncancel = () => {
        resolve({ canceled: true, filePaths: [] });
      };

      input.click();
    });
  },

  showSaveDialog(): Promise<{ canceled: boolean; filePath?: string }> {
    // Em web, usar download automático
    return Promise.resolve({ canceled: true, filePath: undefined });
  },

  // Navigation
  browseToFolder(folderPath: string): void {
    // Em web, não podemos abrir explorador de arquivos
    // Podemos mostrar uma mensagem ou fazer download
    console.warn('browseToFolder not available in web version:', folderPath);
  },

  browseToFile(filePath: string): void {
    // Em web, podemos fazer download do arquivo
    // Usar rota de demos se for um arquivo .dem, senão usar rota genérica
    if (filePath.endsWith('.dem')) {
      window.open(`/api/files/demos/${encodeURIComponent(filePath)}`, '_blank');
    } else {
      // Tentar servir via rota genérica de arquivos
      window.open(`/api/files/image/${encodeURIComponent(filePath)}`, '_blank');
    }
  },

  // Clipboard
  async getClipboardText(): Promise<string> {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  },

  clearClipboard(): void {
    navigator.clipboard.writeText('');
  },

  // Other
  // Executable paths - TODO: Criar handlers se necessário
  getHlaeExecutablePath(): Promise<string> {
    // Por enquanto, retornar vazio
    // TODO: Implementar via API
    return Promise.resolve('');
  },

  getFfmpegExecutablePath(): Promise<string> {
    // Por enquanto, retornar vazio
    // TODO: Implementar via API
    return Promise.resolve('');
  },

  getVirtualDubExecutablePath(): Promise<string> {
    // Por enquanto, retornar vazio
    // TODO: Implementar via API
    return Promise.resolve('');
  },

  getWebFilePath(file: File): string {
    return URL.createObjectURL(file);
  },

  localeChanged(locale: string): void {
    // TODO: Notificar servidor sobre mudança de locale se necessário
    // Por enquanto, apenas atualizar localStorage
    localStorage.setItem('csdm-locale', locale);
  },

  canGoBack(): Promise<boolean> {
    return Promise.resolve(window.history.length > 1);
  },

  canGoForward(): Promise<boolean> {
    // Não há como verificar isso no navegador
    return Promise.resolve(false);
  },

  showTitleBarMenu(): void {
    // No-op em web
  },

  restartApp(): void {
    window.location.reload();
  },

  reloadWindow(): void {
    window.location.reload();
  },

  shouldShowChangelog(): Promise<boolean> {
    // Por enquanto, sempre false
    // TODO: Implementar lógica se necessário
    return Promise.resolve(false);
  },

  getDemoAudioFilePath(demoPath: string): Promise<string> {
    // TODO: Criar handler se necessário
    // Por enquanto, construir path baseado no demoPath
    return Promise.resolve(`${demoPath}.wav`);
  },

  async getDemoAudioData(demoPath: string): Promise<ArrayBuffer> {
    const audioPath = await this.getDemoAudioFilePath(demoPath);
    const response = await fetch(audioPath);
    if (!response.ok) {
      throw new Error('Failed to load demo audio');
    }
    return response.arrayBuffer();
  },

  getCounterStrikeLogFilePath(): Promise<PreloadResult<string>> {
    // TODO: Implementar via API
    return Promise.resolve({ error: { code: ErrorCode.UnknownError } });
  },

  async elementToImage(options: { element: HTMLElement; format?: string }): Promise<string | undefined> {
    // Usar html-to-image ou similar
    try {
      const { toPng, toJpeg } = await import('html-to-image');
      const format = options.format || 'png';
      const dataUrl =
        format === 'jpeg' || format === 'jpg' ? await toJpeg(options.element) : await toPng(options.element);
      return dataUrl;
    } catch (error) {
      console.error('Failed to convert element to image:', error);
      return undefined;
    }
  },

  // Event listeners usando eventos customizados
  onOpenDemoFile(callback: (demoPath: string) => void): () => void {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      callback(customEvent.detail);
    };
    window.addEventListener('csdm:open-demo-file', handler);
    return () => window.removeEventListener('csdm:open-demo-file', handler);
  },

  onOpenSettings(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:open-settings', handler);
    return () => window.removeEventListener('csdm:open-settings', handler);
  },

  onToggleSettingsVisibility(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:toggle-settings', handler);
    return () => window.removeEventListener('csdm:toggle-settings', handler);
  },

  onShowAbout(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:show-about', handler);
    return () => window.removeEventListener('csdm:show-about', handler);
  },

  onNavigateToPendingDownloads(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:navigate-pending-downloads', handler);
    return () => window.removeEventListener('csdm:navigate-pending-downloads', handler);
  },

  onNavigateToBans(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:navigate-bans', handler);
    return () => window.removeEventListener('csdm:navigate-bans', handler);
  },

  onUpdateDownloaded(callback: () => void): () => void {
    const handler = () => callback();
    window.addEventListener('csdm:update-downloaded', handler);
    return () => window.removeEventListener('csdm:update-downloaded', handler);
  },

  hasUpdateReadyToInstall(): Promise<boolean> {
    return Promise.resolve(false); // Não aplicável em web
  },

  installUpdate(): void {
    // No-op em web
  },

  toggleAutoDownloadUpdates(): void {
    // No-op em web
  },

  async writeJsonFile(filePath: string, data: string): Promise<void> {
    const result = await httpClient.callHandler(RendererClientMessageName.WriteBase64File, {
      filePath,
      data,
    });
    if (!result.success) {
      throw new Error(result.message || 'Failed to write JSON file');
    }
  },
};

// Expor globalmente para compatibilidade
if (typeof window !== 'undefined') {
  (window as unknown as { csdm: typeof csdmApi }).csdm = csdmApi;
}
