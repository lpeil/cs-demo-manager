/**
 * Constrói URL Steam para abrir demo no Counter-Strike
 *
 * @param demoPath - Caminho absoluto para o arquivo .dem
 * @param startTick - Tick inicial (opcional)
 * @returns URL Steam no formato: steam://run/730//+playdemo "path"
 */
export function buildSteamDemoUrl(demoPath: string, startTick?: number): string {
  // CS:GO/CS2 App ID: 730
  const baseUrl = 'steam://run/730//';

  // Normalizar caminho para formato Windows (com barras invertidas)
  // Steam espera o caminho com barras invertidas no Windows
  const normalizedPath = process.platform === 'win32' ? demoPath.replace(/\//g, '\\') : demoPath;

  // Escapar aspas no caminho se necessário
  const escapedPath = normalizedPath.replace(/"/g, '\\"');

  let playdemo = `+playdemo "${escapedPath}"`;

  // Adicionar tick inicial se fornecido
  if (startTick !== undefined && startTick > 0) {
    playdemo += ` +demo_gototick ${startTick}`;
  }

  return `${baseUrl}${playdemo}`;
}

/**
 * Constrói URL Steam para abrir partida Valve usando sharecode
 *
 * @param sharecode - Sharecode da partida (formato: CSGO-XXXXX-XXXXX-XXXXX)
 * @returns URL Steam no formato: steam://rungameid/730//+playdemo_match_sharecode "sharecode"
 */
export function buildSteamMatchUrl(sharecode: string): string {
  // CS:GO/CS2 App ID: 730
  const baseUrl = 'steam://rungameid/730//';
  return `${baseUrl}+playdemo_match_sharecode "${sharecode}"`;
}
