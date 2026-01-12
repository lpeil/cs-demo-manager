process.env.PROCESS_NAME = 'server';
import '../common/install-source-map-support';
import 'csdm/node/logger';
import { httpServer } from './http-server';
import { connectDatabase } from 'csdm/node/database/connect-database';
// Importar servidor WebSocket para garantir que seja iniciado
// O servidor WebSocket inicia automaticamente quando o módulo é importado
import './server';

async function start() {
  try {
    // Tentar conectar ao banco de dados automaticamente (opcional)
    // Se falhar, o usuário pode conectar via UI
    try {
      logger.log('Attempting to connect to database...');
      await connectDatabase();
      logger.log('Database connected successfully');
    } catch (error) {
      logger.warn('Could not connect to database automatically. User can connect via UI.');
      logger.warn('Error:', error instanceof Error ? error.message : String(error));
      // Não falhar o servidor se o banco não estiver disponível
      // O usuário pode conectar via UI depois
    }

    // Iniciar servidor WebSocket (porta 4574) - mantido para compatibilidade
    logger.log('Starting WebSocket server...');
    // O servidor WebSocket já está iniciado quando o módulo é importado

    // Iniciar servidor HTTP (porta 3000)
    logger.log('Starting HTTP server...');
    await httpServer.start();

    logger.log('All servers started successfully');
  } catch (error) {
    logger.error('Failed to start servers:', error);
    process.exit(1);
  }
}

// Tratamento de sinais para encerramento gracioso
process.on('SIGINT', async () => {
  logger.log('Received SIGINT, shutting down gracefully...');
  await httpServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.log('Received SIGTERM, shutting down gracefully...');
  await httpServer.stop();
  process.exit(0);
});

// Iniciar servidores
start();
