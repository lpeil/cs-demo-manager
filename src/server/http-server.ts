process.env.PROCESS_NAME = 'http-server';
import '../common/install-source-map-support';
import 'csdm/node/logger';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { WebSocketServer as WSServer } from 'ws';
import { rendererHandlers } from './handlers/renderer-handlers-mapping';
import { RendererClientMessageName } from './renderer-client-message-name';
import { ErrorCode } from '../common/error-code';
import { getErrorCodeFromError } from './get-error-code-from-error';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { getImagesFolderPath } from 'csdm/node/filesystem/get-images-folder-path';
import { getMapsRadarsFolderPath } from 'csdm/node/filesystem/maps/get-maps-radars-folder-path';
import { getMapsThumbnailsFolderPath } from 'csdm/node/filesystem/maps/get-maps-thumbnails-folder-path';
import { getCamerasPreviewsFolderPath } from 'csdm/node/filesystem/cameras/get-cameras-previews-folder-path';
import { getStaticFolderPath } from 'csdm/node/filesystem/get-static-folder-path';
import { Game } from 'csdm/common/types/counter-strike';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(__filename);
const rootFolderPath = path.resolve(__dirname, '../..');
const outFolderPath = path.resolve(rootFolderPath, 'out');

// Porta para o servidor HTTP (diferente da porta do WebSocket)
const HTTP_SERVER_PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

class HttpServerManager {
  private app: Express;
  private httpServer: HttpServer | null = null;
  private wsServer: WSServer | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupApiRoutes();
    this.setupStaticFiles();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // CORS - permitir acesso da rede local
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-Id',
      );
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.log(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupApiRoutes() {
    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Database health check
    this.app.get('/api/health/database', async (req: Request, res: Response) => {
      try {
        // Importar dinamicamente para evitar erro se o módulo não estiver carregado
        const { db } = await import('csdm/node/database/database');

        // Verificar se db está definido
        if (!db) {
          return res.status(503).json({
            status: 'error',
            connected: false,
            message: 'Database not initialized',
            timestamp: new Date().toISOString(),
          });
        }

        // Tentar uma query simples para verificar conexão
        await db.selectFrom('migrations').select('schema_version').limit(1).execute();

        res.json({
          status: 'ok',
          connected: true,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(503).json({
          status: 'error',
          connected: false,
          message: error instanceof Error ? error.message : 'Database not connected',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Rotas específicas para arquivos estáticos
    this.setupFileRoutes();

    // Rotas específicas para upload de arquivos
    this.setupUploadRoutes();

    // Helper function para verificar conexão do banco (se necessário)
    const checkDatabaseConnection = async (): Promise<boolean> => {
      try {
        // Importar dinamicamente para evitar erro se o módulo não estiver carregado
        const { db } = await import('csdm/node/database/database');
        // Verificar se db está definido
        if (!db) {
          return false;
        }
        // Tentar uma query simples
        await db.selectFrom('migrations').select('schema_version').limit(1).execute();
        return true;
      } catch {
        return false;
      }
    };

    // Lista de handlers que não requerem conexão com banco
    const handlersWithoutDatabase = new Set<string>([
      RendererClientMessageName.InitializeApplication,
      RendererClientMessageName.ConnectDatabase,
      RendererClientMessageName.Login,
      RendererClientMessageName.Logout,
      RendererClientMessageName.CheckAuth,
    ]);

    // Lista de handlers que não requerem autenticação (públicos)
    const publicHandlers = new Set<string>([
      RendererClientMessageName.InitializeApplication,
      RendererClientMessageName.ConnectDatabase,
      RendererClientMessageName.Login,
      RendererClientMessageName.CheckAuth,
    ]);

    // Helper function para executar handlers
    const executeHandler = async (
      messageName: string,
      payload: unknown,
      res: Response,
      req: Request,
    ): Promise<void> => {
      try {
        // Verificar se o handler existe
        const handler = rendererHandlers[messageName as RendererClientMessageName];
        if (!handler) {
          res.status(404).json({
            success: false,
            error: 'Handler not found',
            messageName,
          });
          return;
        }

        // Verificar autenticação para handlers protegidos (exceto públicos)
        if (!publicHandlers.has(messageName)) {
          const sessionId = req.headers['x-session-id'] as string | undefined;
          if (!sessionId) {
            res.status(401).json({
              success: false,
              error: 'UNAUTHORIZED',
              message: 'Authentication required',
            });
            return;
          }
          // Verificar sessão (usando optionalAuth logic)
          const { sessionStore } = await import('./auth/session-store');
          const session = sessionStore.getSession(sessionId);
          if (!session) {
            res.status(401).json({
              success: false,
              error: 'UNAUTHORIZED',
              message: 'Invalid or expired session',
            });
            return;
          }
        }

        // Verificar conexão do banco para handlers que precisam (exceto os que não precisam)
        if (!handlersWithoutDatabase.has(messageName as RendererClientMessageName)) {
          const isConnected = await checkDatabaseConnection();
          if (!isConnected) {
            res.status(503).json({
              success: false,
              error: ErrorCode.UnknownError,
              message: 'Database not connected. Please connect to database first.',
            });
            return;
          }
        }

        // Executar handler
        // Se o payload é undefined ou vazio, passar void
        const hasPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = hasPayload ? await (handler as any)(payload) : await (handler as any)();

        // Se o resultado é void, retornar sucesso sem dados
        if (result === undefined) {
          res.json({ success: true });
        } else {
          res.json({ success: true, data: result });
        }
      } catch (error) {
        const errorCode = getErrorCodeFromError(error);
        logger.error(`API error handling ${messageName}:`, error);
        res.status(500).json({
          success: false,
          error: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    // API routes - mapear handlers do WebSocket para HTTP REST
    // POST para operações que modificam estado
    this.app.post('/api/:messageName', async (req: Request, res: Response) => {
      const messageNameParam = req.params.messageName;
      const messageName = Array.isArray(messageNameParam) ? messageNameParam[0] : messageNameParam;
      await executeHandler(messageName, req.body, res, req);
    });

    // GET para operações de leitura (alguns handlers podem ser GET)
    this.app.get('/api/:messageName', async (req: Request, res: Response) => {
      const messageNameParam = req.params.messageName;
      const messageName = Array.isArray(messageNameParam) ? messageNameParam[0] : messageNameParam;
      // Converter query params para objeto
      const payload = Object.keys(req.query).length > 0 ? req.query : undefined;
      await executeHandler(messageName, payload, res, req);
    });

    // PUT para atualizações
    this.app.put('/api/:messageName', async (req: Request, res: Response) => {
      const messageNameParam = req.params.messageName;
      const messageName = Array.isArray(messageNameParam) ? messageNameParam[0] : messageNameParam;
      await executeHandler(messageName, req.body, res, req);
    });

    // DELETE para remoções
    this.app.delete('/api/:messageName', async (req: Request, res: Response) => {
      const messageNameParam = req.params.messageName;
      const messageName = Array.isArray(messageNameParam) ? messageNameParam[0] : messageNameParam;
      const payload = Object.keys(req.query).length > 0 ? req.query : req.body;
      await executeHandler(messageName, payload, res, req);
    });
  }

  /**
   * Rotas específicas para servir arquivos estáticos do sistema de arquivos
   */
  private setupFileRoutes() {
    // Servir imagens de mapas
    // GET /api/files/maps/:game/:mapName/radar
    // GET /api/files/maps/:game/:mapName/thumbnail
    // GET /api/files/maps/:game/:mapName/lower-radar
    this.app.get('/api/files/maps/:game/:mapName/:type', (req: Request, res: Response) => {
      try {
        const { game, mapName, type } = req.params;
        const gameParam = Array.isArray(game) ? game[0] : game;
        const mapNameParam = Array.isArray(mapName) ? mapName[0] : mapName;
        const typeParam = Array.isArray(type) ? type[0] : type;
        const gameEnum = gameParam === 'csgo' ? Game.CSGO : Game.CS2;

        let filePath: string;
        if (typeParam === 'radar') {
          filePath = path.join(getMapsRadarsFolderPath(gameEnum), `${mapNameParam}.png`);
        } else if (typeParam === 'thumbnail') {
          filePath = path.join(getMapsThumbnailsFolderPath(gameEnum), `${mapNameParam}.png`);
        } else if (typeParam === 'lower-radar') {
          filePath = path.join(getMapsRadarsFolderPath(gameEnum), `${mapNameParam}_lower.png`);
        } else {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid image type' });
        }

        if (!existsSync(filePath)) {
          return res.status(404).json({ success: false, error: ErrorCode.UnknownError, message: 'File not found' });
        }

        const fileBuffer = readFileSync(filePath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving map image:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir arquivos de áudio de demos
    // GET /api/files/audio/:demoPath
    // Usar regex para capturar tudo após /api/files/audio/
    this.app.get(/^\/api\/files\/audio\/(.+)$/, (req: Request, res: Response) => {
      try {
        // Extrair o caminho do demo do URL usando regex match
        const match = req.url.match(/^\/api\/files\/audio\/(.+)$/);
        const audioPath = match ? match[1] : '';

        if (!audioPath || !existsSync(audioPath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Audio file not found' });
        }

        const stats = statSync(audioPath);
        const fileBuffer = readFileSync(audioPath);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache por 1 hora
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving audio file:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir imagens genéricas do sistema de arquivos
    // GET /api/files/image/:path
    // O path deve ser relativo à pasta de imagens ou absoluto (com validação de segurança)
    // Usar regex para capturar tudo após /api/files/image/
    this.app.get(/^\/api\/files\/image\/(.+)$/, (req: Request, res: Response) => {
      try {
        const match = req.url.match(/^\/api\/files\/image\/(.+)$/);
        const imagePath = match ? match[1] : '';

        // Validar que o caminho não contém sequências perigosas
        if (imagePath.includes('..') || imagePath.includes('//')) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid path' });
        }

        // Tentar caminho absoluto primeiro, depois relativo à pasta de imagens
        let fullPath: string;
        if (path.isAbsolute(imagePath)) {
          fullPath = imagePath;
        } else {
          fullPath = path.join(getImagesFolderPath(), imagePath);
        }

        if (!existsSync(fullPath)) {
          return res.status(404).json({ success: false, error: ErrorCode.UnknownError, message: 'Image not found' });
        }

        const fileBuffer = readFileSync(fullPath);
        const ext = path.extname(fullPath).toLowerCase();
        const contentType =
          ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving image file:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir arquivos de demo (download)
    // GET /api/files/demo/* - Serve arquivos .dem
    // Usar regex para capturar tudo após /api/files/demo/
    this.app.get(/^\/api\/files\/demo\/(.+)$/, (req: Request, res: Response) => {
      try {
        const match = req.url.match(/^\/api\/files\/demo\/(.+)$/);
        const demoPath = match ? match[1] : '';

        // Validar que o caminho não contém sequências perigosas
        if (!demoPath || demoPath.includes('..') || demoPath.includes('//')) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid path' });
        }

        // Validar que é um arquivo .dem
        if (!demoPath.toLowerCase().endsWith('.dem')) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid file type' });
        }

        if (!existsSync(demoPath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Demo file not found' });
        }

        const stats = statSync(demoPath);
        const fileBuffer = readFileSync(demoPath);

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(demoPath)}"`);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'no-cache'); // Não cachear demos
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving demo file:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir imagens de ranks (competitive)
    // GET /api/files/ranks/competitive/:rank
    this.app.get('/api/files/ranks/competitive/:rank', (req: Request, res: Response) => {
      try {
        const rankParam = req.params.rank;
        const rank = Array.isArray(rankParam) ? rankParam[0] : rankParam;

        // Validar rank
        const rankNumber = Number.parseInt(rank, 10);
        if (Number.isNaN(rankNumber) || rankNumber < 0 || rankNumber > 18) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid rank' });
        }

        const rankImagePath = path.join(getImagesFolderPath(), 'ranks', 'competitive', `${rank}.png`);

        if (!existsSync(rankImagePath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Rank image not found' });
        }

        const fileBuffer = readFileSync(rankImagePath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving rank image:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir imagens de ranks (premier)
    // GET /api/files/ranks/premier/:tier
    this.app.get('/api/files/ranks/premier/:tier', (req: Request, res: Response) => {
      try {
        const tierParam = req.params.tier;
        const tier = Array.isArray(tierParam) ? tierParam[0] : tierParam;

        // Validar tier (1-21)
        const tierNumber = Number.parseInt(tier, 10);
        if (Number.isNaN(tierNumber) || tierNumber < 1 || tierNumber > 21) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid tier' });
        }

        const tierImagePath = path.join(getImagesFolderPath(), 'ranks', 'premier', `tier-${tier}.png`);

        if (!existsSync(tierImagePath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Tier image not found' });
        }

        const fileBuffer = readFileSync(tierImagePath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving premier tier image:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir previews de câmeras
    // GET /api/files/cameras/:cameraId
    this.app.get('/api/files/cameras/:cameraId', (req: Request, res: Response) => {
      try {
        const cameraIdParam = req.params.cameraId;
        const cameraId = Array.isArray(cameraIdParam) ? cameraIdParam[0] : cameraIdParam;

        // Validar que o ID não contém sequências perigosas
        if (!cameraId || cameraId.includes('..') || cameraId.includes('/') || cameraId.includes('\\')) {
          return res.status(400).json({ success: false, error: ErrorCode.UnknownError, message: 'Invalid camera ID' });
        }

        const cameraPreviewPath = path.join(getCamerasPreviewsFolderPath(), `${cameraId}.png`);

        if (!existsSync(cameraPreviewPath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Camera preview not found' });
        }

        const fileBuffer = readFileSync(cameraPreviewPath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving camera preview:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir avatar padrão de jogador
    // GET /api/files/avatar
    this.app.get('/api/files/avatar', (req: Request, res: Response) => {
      try {
        const avatarPath = path.join(getImagesFolderPath(), 'avatar.jpg');

        if (!existsSync(avatarPath)) {
          return res.status(404).json({ success: false, error: ErrorCode.UnknownError, message: 'Avatar not found' });
        }

        const fileBuffer = readFileSync(avatarPath);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving avatar:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Servir imagem "unknown" para mapas
    // GET /api/files/unknown-image
    this.app.get('/api/files/unknown-image', (req: Request, res: Response) => {
      try {
        const unknownImagePath = path.join(getImagesFolderPath(), 'maps', 'unknown.png');

        if (!existsSync(unknownImagePath)) {
          return res
            .status(404)
            .json({ success: false, error: ErrorCode.UnknownError, message: 'Unknown image not found' });
        }

        const fileBuffer = readFileSync(unknownImagePath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
        res.send(fileBuffer);
      } catch (error) {
        logger.error('Error serving unknown image:', error);
        res.status(500).json({
          success: false,
          error: ErrorCode.UnknownError,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Rotas específicas para upload de arquivos
   */
  private setupUploadRoutes() {
    // Upload de arquivo base64
    // POST /api/upload/base64
    // Body: { filePath: string, data: string (base64) }
    this.app.post('/api/upload/base64', express.json({ limit: '100mb' }), (req: Request, res: Response) => {
      try {
        const { filePath, data } = req.body;

        if (!filePath || !data) {
          return res.status(400).json({
            success: false,
            error: ErrorCode.UnknownError,
            message: 'filePath and data are required',
          });
        }

        // Validar que o caminho não contém sequências perigosas
        if (filePath.includes('..') || filePath.includes('//')) {
          return res.status(400).json({
            success: false,
            error: ErrorCode.UnknownError,
            message: 'Invalid file path',
          });
        }

        // Usar o handler existente para escrever o arquivo
        const handler = rendererHandlers[RendererClientMessageName.WriteBase64File];
        if (!handler) {
          return res.status(500).json({
            success: false,
            error: ErrorCode.UnknownError,
            message: 'WriteBase64File handler not found',
          });
        }

        handler({ filePath, data })
          .then(() => {
            res.json({ success: true });
          })
          .catch((error) => {
            const errorCode = getErrorCodeFromError(error);
            logger.error('Error uploading base64 file:', error);
            res.status(500).json({
              success: false,
              error: errorCode,
              message: error instanceof Error ? error.message : 'Unknown error',
            });
          });
      } catch (error) {
        const errorCode = getErrorCodeFromError(error);
        logger.error('Error uploading base64 file:', error);
        res.status(500).json({
          success: false,
          error: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  private setupStaticFiles() {
    // Servir arquivos estáticos do build do frontend
    const staticPath = path.join(outFolderPath);

    // Servir assets estáticos do frontend (JS, CSS, imagens, etc.)
    // Com cache longo para assets versionados
    this.app.use(
      express.static(staticPath, {
        maxAge: '1y', // Cache por 1 ano para assets versionados
        etag: true,
        lastModified: true,
      }),
    );

    // Servir arquivos estáticos do sistema (imagens, assets do app)
    // Estes são servidos via rotas específicas em setupFileRoutes()
    // Mas também podemos servir a pasta static diretamente para assets gerais
    const appStaticPath = getStaticFolderPath();
    this.app.use(
      '/static',
      express.static(appStaticPath, {
        maxAge: '1y',
        etag: true,
        lastModified: true,
      }),
    );

    // Para SPA - todas as rotas não-API servem o index.html
    // IMPORTANTE: Esta rota deve ser a última para não interceptar rotas de API
    // Usar regex para capturar todas as rotas
    this.app.get(/.*/, (req: Request, res: Response) => {
      // Não servir index.html para rotas de API ou arquivos
      if (req.path.startsWith('/api/') || req.path.startsWith('/static/')) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Verificar se é um arquivo estático (tem extensão)
      const ext = path.extname(req.path);
      if (ext && ext !== '.html') {
        return res.status(404).json({ error: 'Not found' });
      }

      // Servir index.html para todas as outras rotas (SPA routing)
      const indexPath = path.join(staticPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

  private setupErrorHandling() {
    // Error handling middleware
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        success: false,
        error: ErrorCode.UnknownError,
        message: err.message || 'Internal server error',
      });
      void req;
      void next;
    });
  }

  public start() {
    return new Promise<void>((resolve, reject) => {
      try {
        // Criar servidor HTTP
        this.httpServer = createHttpServer(this.app);

        // Integrar WebSocket server com o servidor HTTP
        // O servidor WebSocket existente será mantido na porta 4574 para compatibilidade
        // Mas também podemos aceitar conexões WebSocket no servidor HTTP na mesma porta
        // Isso permite que o cliente conecte via ws://localhost:3000/ws em vez de ws://localhost:4574
        this.wsServer = new WSServer({
          server: this.httpServer,
          path: '/ws',
        });

        // Integrar com o servidor WebSocket existente
        // Quando uma conexão chega no HTTP server, também registramos no servidor original
        this.wsServer.on('connection', (ws, req) => {
          logger.log('WebSocket connection received on HTTP server');

          // Reencaminhar mensagens do cliente para o servidor WebSocket original
          ws.on('message', (message) => {
            // O servidor WebSocket original processa as mensagens
            // Por enquanto, apenas logamos - o cliente híbrido usa a porta 4574 diretamente
            logger.debug('WS:: Message received on HTTP server WebSocket:', message.toString());
            void req;
          });

          ws.on('close', () => {
            logger.log('WebSocket connection closed on HTTP server');
            void req;
          });

          ws.on('error', (error) => {
            logger.error('WebSocket error on HTTP server:', error);
            void req;
          });
        });

        // Iniciar servidor HTTP
        this.httpServer.listen(HTTP_SERVER_PORT, () => {
          logger.log(`HTTP server listening on port ${HTTP_SERVER_PORT}`);
          logger.log(`WebSocket server available at ws://localhost:${HTTP_SERVER_PORT}/ws`);
          logger.log(`API available at http://localhost:${HTTP_SERVER_PORT}/api`);
          resolve();
        });

        this.httpServer.on('error', (error: Error) => {
          logger.error('HTTP server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start HTTP server:', error);
        reject(error);
      }
    });
  }

  public stop() {
    return new Promise<void>((resolve) => {
      if (this.wsServer) {
        this.wsServer.close(() => {
          logger.log('WebSocket server closed');
        });
      }

      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.log('HTTP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const httpServer = new HttpServerManager();
