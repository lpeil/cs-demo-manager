import { watchDemo } from 'csdm/node/counter-strike/launcher/watch-demo';
import { handleWatchDemoError, onGameStart, type WatchDemoErrorPayload } from 'csdm/server/counter-strike';
import { buildSteamDemoUrl } from 'csdm/node/counter-strike/launcher/build-steam-demo-url';
import { detectDemoGame } from 'csdm/node/counter-strike/launcher/detect-demo-game';
import { installCounterStrikeServerPlugin } from 'csdm/node/counter-strike/launcher/cs-server-plugin';
import { getSettings } from 'csdm/node/settings/get-settings';
import { JSONActionsFileGenerator } from 'csdm/node/counter-strike/json-actions-file/json-actions-file-generator';
import { deleteJsonActionsFile } from 'csdm/node/counter-strike/json-actions-file/delete-json-actions-file';
import { getDemoChecksumFromDemoPath } from 'csdm/node/demo/get-demo-checksum-from-demo-path';
import { fetchMatchPlayersSlots } from 'csdm/node/database/match/fetch-match-players-slots';
import { Game } from 'csdm/common/types/counter-strike';

export type WatchDemoPayload = {
  demoPath: string;
  focusSteamId?: string;
  startTick?: number;
  additionalArguments?: string[];
  useSteamUrl?: boolean; // Nova opção: usar URL Steam em vez de executar diretamente
};

export type WatchDemoResponse = {
  steamUrl?: string; // URL Steam se useSteamUrl for true
  success: boolean;
};

async function generateJsonActionsFileForSteam(
  demoPath: string,
  game: Game,
  playerVoicesEnabled: boolean,
  startTick?: number,
  steamId?: string,
) {
  const json = new JSONActionsFileGenerator(demoPath, game);

  if (playerVoicesEnabled) {
    json.enablePlayerVoices();
  } else {
    json.disablePlayerVoices();
  }

  if (startTick) {
    json.addSkipAhead(0, startTick);
  }

  if (steamId || game !== Game.CSGO) {
    const checksum = await getDemoChecksumFromDemoPath(demoPath);
    const players = await fetchMatchPlayersSlots(checksum);
    if (game !== Game.CSGO) {
      json.generateVoiceAliases(players);
    }
    if (steamId) {
      const player = players.find((player) => player.steamId === steamId);
      if (player) {
        json.addSpecPlayer(startTick ?? 0, player.slot);
      }
    }
  }

  await json.write();
}

export async function watchDemoHandler(
  payload: WatchDemoPayload,
): Promise<WatchDemoResponse | WatchDemoErrorPayload | void> {
  try {
    const { useSteamUrl = true } = payload; // Por padrão, usar URL Steam na versão web

    // Se usar URL Steam (versão web)
    if (useSteamUrl) {
      const game = await detectDemoGame(payload.demoPath);
      const settings = await getSettings();

      // Instalar plugin antes de abrir URL Steam (para funcionalidades avançadas)
      // O plugin será usado quando o jogo iniciar via Steam
      await installCounterStrikeServerPlugin(game);

      // Gerar arquivo JSON de ações (necessário para funcionalidades avançadas)
      // Isso garante que o arquivo esteja pronto quando o jogo iniciar
      const { playerVoicesEnabled } = settings.playback;
      await deleteJsonActionsFile(payload.demoPath);
      await generateJsonActionsFileForSteam(
        payload.demoPath,
        game,
        playerVoicesEnabled,
        payload.startTick,
        payload.focusSteamId,
      );

      // Construir URL Steam
      const steamUrl = buildSteamDemoUrl(payload.demoPath, payload.startTick);

      // Notificar que o jogo está iniciando
      onGameStart();

      // Retornar URL Steam para o cliente abrir
      return {
        steamUrl,
        success: true,
      };
    }

    // Comportamento original (executar diretamente) - mantido para compatibilidade
    await watchDemo({
      ...payload,
      onGameStart,
    });
  } catch (error) {
    // Se useSteamUrl for true, retornar erro como resposta
    if (payload.useSteamUrl) {
      const errorPayload = handleWatchDemoError(error, payload.demoPath, 'Error watching demo');
      // Lançar erro para ser capturado pelo sistema de erro do HTTP server
      throw errorPayload;
    }
    // Comportamento original: retornar erro
    return handleWatchDemoError(error, payload.demoPath, 'Error watching demo');
  }
}
