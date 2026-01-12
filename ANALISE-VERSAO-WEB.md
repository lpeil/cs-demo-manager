# Análise: Adaptação do CS Demo Manager para Versão Web

## Visão Geral

O CS Demo Manager é atualmente uma aplicação **Electron** que combina:
- **Frontend**: React com TypeScript (em `src/ui/`)
- **Backend**: Processo Node.js com WebSocket Server (em `src/server/`)
- **Main Process**: Gerenciamento de janelas Electron (em `src/electron-main/`)
- **Preload Script**: Bridge entre renderer e main process (em `src/preload/`)
- **Plugins nativos**: Plugins C++ para CS:GO e CS2 (em `csgo-server-plugin/` e `cs2-server-plugin/`)

## Arquitetura Proposta: Servidor Web Local

**IMPORTANTE**: A versão web será um **servidor local** que roda no mesmo computador onde:
- O jogo Counter-Strike está instalado
- Os demos estão armazenados
- Os plugins podem ser executados
- Há acesso direto ao sistema de arquivos

Isso simplifica significativamente a migração, pois mantém acesso a todos os recursos locais.

## Arquitetura Atual

### Comunicação entre Componentes

1. **IPC (Inter-Process Communication)**: Electron IPC entre renderer e main process
2. **WebSocket**: Comunicação entre renderer/main/game processes e o servidor WebSocket
3. **Preload API**: API exposta via `window.csdm` para acesso seguro ao Node.js

### Componentes Principais

- **UI (React)**: Interface do usuário em `src/ui/`
- **WebSocket Server**: Servidor em `src/server/server.ts` (porta 4574)
- **Handlers**: Processadores de mensagens em `src/server/handlers/`
- **Database**: PostgreSQL com Kysely ORM
- **File System**: Operações extensivas de leitura/escrita de arquivos

## Modificações Necessárias para Versão Web

### 1. **Remoção de Dependências Electron**

#### Arquivos/Diretórios a Remover ou Refatorar:
- `src/electron-main/` - Todo o código do main process
- `src/preload/` - Preload scripts não são necessários em web
- `electron-builder.config.js` - Configuração de build Electron
- Dependências no `package.json`:
  - `electron`
  - `electron-builder`
  - `electron-devtools-installer`
  - `electron-updater`
  - `electron-window-state`

#### Impacto:
- Remover todas as chamadas IPC
- Remover referências a `window.csdm` na UI
- Adaptar funcionalidades que dependem do Electron

---

### 2. **Substituição do Sistema de Comunicação**

#### Atual: IPC + WebSocket
- IPC para comunicação renderer ↔ main
- WebSocket para comunicação com servidor backend

#### Novo: API REST/GraphQL + WebSocket
- **API REST ou GraphQL**: Substituir IPC channels por endpoints HTTP
- **WebSocket**: Manter para comunicação em tempo real (notificações, progresso)

#### Modificações:
- Criar servidor HTTP (Express/Fastify) em `src/server/`
- Converter handlers IPC em rotas HTTP
- Manter WebSocket para funcionalidades em tempo real
- Criar cliente HTTP na UI para substituir `window.csdm`

---

### 3. **Gerenciamento de Arquivos**

#### ✅ Vantagem da Arquitetura Local:
Como o servidor roda **localmente** no mesmo computador:
- ✅ **Acesso direto ao sistema de arquivos** - Mantém todas as operações atuais
- ✅ **Leitura/escrita de demos** - Funciona normalmente via Node.js
- ✅ **Configurações em arquivos locais** - Pode manter ou migrar para banco
- ✅ **Imagens e assets locais** - Servidos diretamente via HTTP
- ✅ **Logs locais** - Escrita direta no sistema de arquivos

#### Modificações Necessárias:
- **Servir arquivos estáticos**: Configurar servidor HTTP para servir assets/imagens
- **Endpoints de arquivo**: Criar rotas para servir demos/imagens quando necessário
- **Manter operações de FS**: Todas as funções em `src/node/filesystem/*` continuam funcionando
- **Configurações**: Pode manter arquivos ou migrar para banco (opcional)

#### Arquivos a Modificar:
- `src/node/filesystem/*` - **Manter** (funciona normalmente no servidor)
- `src/node/settings/*` - **Manter** ou migrar para banco (opcional)
- Criar rotas HTTP para servir arquivos quando necessário

---

### 4. **Banco de Dados**

#### Atual:
- PostgreSQL local ou remoto
- Conexão direta do processo Node.js

#### Web:
- **Manter PostgreSQL**: Funciona perfeitamente em ambiente web
- **Conexão via API**: UI não conecta diretamente, apenas via backend
- **Autenticação**: Adicionar sistema de autenticação (usuários, sessões)

#### Modificações:
- Criar endpoints de API para todas as queries
- Adicionar autenticação/autorização
- Migrar configurações de arquivo para banco de dados

---

### 5. **Plugins de Jogo (CS:GO/CS2)**

#### ✅ Vantagem da Arquitetura Local:
Como o servidor roda **localmente** no mesmo computador:
- ✅ **Plugins continuam funcionando** - Podem ser executados pelo servidor Node.js
- ✅ **WebSocket com plugins** - Mantém comunicação via WebSocket
- ✅ **Análise de demos** - Processamento local funciona normalmente

#### Modificações Necessárias:
- **Manter plugins**: Plugins C++ continuam funcionando
- **Execução via servidor**: Servidor Node.js executa plugins quando necessário
- **WebSocket**: Manter comunicação entre servidor e plugins

#### Impacto:
- ✅ Funcionalidades de análise de demos **mantidas**
- ✅ Processamento local **mantido**
- ⚠️ "Watch demo" precisa ser adaptado (ver seção 6)

---

### 6. **UI - Substituição de `window.csdm`**

#### Funções que Precisam ser Substituídas:

**Gerenciamento de Janela** (Remover):
- `minimizeWindow()`, `maximizeWindow()`, `closeWindow()`
- `isWindowMaximized()`, `onWindowMaximized()`, etc.

**Diálogos de Arquivo** (Substituir):
- `showOpenDialog()` → Upload de arquivo HTML5
- `showSaveDialog()` → Download via API

**Sistema de Arquivos** (Substituir):
- `pathExists()` → Verificar via API
- `browseToFolder()` → Remover ou substituir por link
- `browseToFile()` → Download via API

**Configurações** (Substituir):
- `parseSettingsFile()` → API GET `/api/settings`
- `updateSettings()` → API PUT `/api/settings`
- `writeTableState()` → API POST `/api/table-state`

**Clipboard** (Manter):
- `getClipboardText()` → `navigator.clipboard.readText()`
- `clearClipboard()` → `navigator.clipboard.writeText('')`

**Imagens/Assets** (Substituir):
- `getMapRadarBase64()` → API GET `/api/maps/{map}/radar`
- `getRankImageSrc()` → Assets estáticos servidos via CDN/server
- `getDefaultPlayerAvatar()` → Asset estático

**Outros**:
- `getAppInformation()` → API GET `/api/app/info`
- `getTheme()` → API GET `/api/settings/theme` ou localStorage
- `getStartupArguments()` → Query params da URL

### 6.1. **"Watch Demo" - Nova Estratégia**

#### Atual:
- Executa Counter-Strike localmente via linha de comando
- Usa plugins para controle avançado

#### Nova Estratégia (Servidor Local):
**Usar URLs Steam para abrir o jogo:**

Para demos locais:
```
steam://run/730//+playdemo "C:\path\to\demo.dem"
```

Para partidas Valve (com sharecode):
```
steam://rungameid/730//+playdemo_match_sharecode "CSGO-XXXXX-XXXXX-XXXXX"
```

#### Implementação:
1. **Endpoint API**: `POST /api/counter-strike/watch-demo`
   - Recebe: `{ demoPath, startTick?, focusSteamId? }`
   - Gera arquivo JSON de ações (se necessário)
   - Retorna URL Steam ou executa comando local

2. **Na UI**: Substituir `watchDemo()` por:
   - Chamada à API
   - Abrir URL Steam no navegador (ou executar comando no servidor)

3. **Vantagens**:
   - ✅ Funciona de qualquer dispositivo na rede local
   - ✅ Não precisa de acesso direto ao sistema de arquivos do cliente
   - ✅ Steam gerencia a abertura do jogo

#### Limitações:
- ⚠️ Requer Steam instalado e rodando no servidor
- ⚠️ Funcionalidades avançadas (HLAE, controle via plugin) podem precisar de adaptação
- ⚠️ Parâmetros customizados podem precisar ser passados via arquivo de configuração

#### Implementação Detalhada:

**1. Endpoint API** (`src/server/api/counter-strike/watch-demo.ts`):
```typescript
// POST /api/counter-strike/watch-demo
export async function watchDemoHandler(req, res) {
  const { demoPath, startTick, focusSteamId, game } = req.body;
  
  // Gerar arquivo JSON de ações (se necessário para funcionalidades avançadas)
  await generateJsonActionsFile(demoPath, game, startTick, focusSteamId);
  
  // Construir URL Steam
  const steamUrl = buildSteamDemoUrl(demoPath, startTick);
  
  // Opção A: Retornar URL para o cliente abrir
  return res.json({ steamUrl });
  
  // Opção B: Executar no servidor (se Steam estiver acessível)
  // await executeSteamUrl(steamUrl);
}

function buildSteamDemoUrl(demoPath: string, startTick?: number): string {
  // CS:GO/CS2 App ID: 730
  const baseUrl = 'steam://run/730//';
  const playdemo = `+playdemo "${demoPath}"`;
  
  if (startTick) {
    return `${baseUrl}${playdemo} +demo_gototick ${startTick}`;
  }
  
  return `${baseUrl}${playdemo}`;
}
```

**2. Na UI** (`src/ui/hooks/use-counter-strike.ts`):
```typescript
export function useCounterStrike() {
  const watchDemo = async (options: WatchDemoOptions) => {
    // Chamar API
    const response = await fetch('/api/counter-strike/watch-demo', {
      method: 'POST',
      body: JSON.stringify(options),
    });
    
    const { steamUrl } = await response.json();
    
    // Abrir URL Steam (funciona em navegadores modernos)
    window.location.href = steamUrl;
    
    // Ou criar link e clicar programaticamente
    // const link = document.createElement('a');
    // link.href = steamUrl;
    // link.click();
  };
  
  return { watchDemo };
}
```

**3. Para Partidas Valve (Sharecode)**:
```typescript
// Para partidas Valve com sharecode
function buildSteamMatchUrl(sharecode: string): string {
  return `steam://rungameid/730//+playdemo_match_sharecode "${sharecode}"`;
}
```

#### Arquivos a Modificar:
- `src/node/counter-strike/launcher/watch-demo.ts` - Adaptar para gerar URL Steam
- `src/ui/hooks/use-counter-strike.ts` - Adaptar para chamar API e abrir URL
- Criar endpoint `POST /api/counter-strike/watch-demo`
- Criar utilitário `src/node/counter-strike/steam-url-builder.ts`

#### Arquivos a Modificar:
- Todos os arquivos em `src/ui/` que usam `window.csdm.*`
- Criar hooks/utilities para substituir funcionalidades

---

### 7. **Autenticação e Autorização**

#### ⚠️ Opcional para Servidor Local:
Para servidor local na rede doméstica, autenticação pode ser **opcional** ou **simplificada**:

**Opção A: Sem Autenticação (Rede Local)**
- Servidor acessível apenas na rede local
- Sem autenticação (todos têm acesso)
- Adequado para uso pessoal

**Opção B: Autenticação Simples**
- Login básico (usuário/senha)
- Sessões simples
- Adequado para uso em casa com múltiplos usuários

**Opção C: Autenticação Completa**
- Sistema completo de usuários
- JWT tokens
- Multi-tenancy
- Necessário se expor na internet

#### Recomendação:
- **Inicialmente**: Opção A ou B (sem ou simples)
- **Futuro**: Opção C se necessário expor publicamente

#### Modificações (se implementar):
- Criar `src/server/auth/` com rotas de autenticação (opcional)
- Adicionar tabelas de usuários no banco (opcional)
- Middleware de autenticação (opcional)
- UI de login (opcional)

---

### 8. **Deploy e Infraestrutura**

#### Atual:
- Aplicação desktop instalada localmente
- Acesso direto a recursos do sistema

#### Web (Servidor Local):
- **Frontend + Backend**: Servidor Node.js local (mesmo processo ou separados)
- **Database**: PostgreSQL local (mesmo que atual)
- **Storage**: Sistema de arquivos local (mesmo que atual)
- **Acesso**: Via navegador em `http://localhost:PORT` ou `http://IP-LOCAL:PORT`

#### Configurações:
- **Porta do servidor**: Configurável (ex: 3000, 8080)
- **CORS**: Configurar para permitir acesso da rede local (opcional)
- **HTTPS**: Opcional (não necessário para rede local)
- **Firewall**: Pode precisar abrir porta na rede local

#### Vantagens:
- ✅ Não requer infraestrutura cloud
- ✅ Sem custos de hospedagem
- ✅ Acesso direto a todos os recursos locais
- ✅ Funciona offline (na rede local)

---

### 9. **Build e Desenvolvimento**

#### Modificações no Build:

**Atual (`vite.config.mts`)**:
- Build para Electron renderer process

**Novo**:
- Build para produção web padrão
- Configurar base path para deploy
- Otimizações de bundle

**Scripts (`package.json`)**:
- Remover scripts Electron
- Adicionar scripts de build/deploy web
- Adicionar script para iniciar servidor de desenvolvimento

---

### 10. **Funcionalidades Específicas**

#### Funcionalidades que Precisam de Atenção Especial:

**1. Análise de Demos**
- Atual: Processamento local
- Web: Processamento no servidor (pode ser lento, requer fila de jobs)

**2. Download de Demos**
- Atual: Download direto para sistema de arquivos
- Web: Download para servidor, depois disponibilizar para usuário

**3. Geração de Vídeos**
- Atual: Usa FFmpeg local
- Web: Processamento no servidor ou remover funcionalidade

**4. Integração com Steam/Valve**
- Manter, mas adaptar para funcionar via servidor

**5. Notificações**
- Atual: Notificações do sistema (Electron)
- Web: Notificações do navegador ou in-app

**6. Auto-update**
- Atual: Electron updater
- Web: Deploy contínuo, não precisa de updater

---

## Estrutura Proposta para Versão Web

```
src/
├── server/                    # Backend Node.js
│   ├── api/                  # Rotas HTTP REST
│   │   ├── auth/            # Autenticação
│   │   ├── demos/           # Endpoints de demos
│   │   ├── matches/         # Endpoints de matches
│   │   ├── players/         # Endpoints de players
│   │   └── settings/        # Endpoints de configurações
│   ├── handlers/            # Handlers (manter estrutura atual)
│   ├── middleware/          # Middleware (auth, CORS, etc)
│   ├── websocket/           # WebSocket server (manter)
│   └── server.ts            # Servidor HTTP principal
│
├── ui/                      # Frontend React (manter)
│   ├── api/                 # Cliente HTTP para API
│   ├── hooks/               # Hooks para substituir window.csdm
│   └── ...                  # Resto da UI
│
└── node/                    # Código compartilhado (manter)
    ├── database/
    ├── filesystem/          # Adaptar para trabalhar com uploads
    └── ...
```

---

## Plano de Migração Sugerido

### Fase 1: Preparação
1. Criar estrutura de API REST
2. Implementar autenticação básica
3. Migrar configurações para banco de dados

### Fase 2: Substituição de Comunicação
1. Substituir IPC por chamadas HTTP
2. Criar cliente API na UI
3. Remover dependências do Electron
4. **Adaptar "Watch Demo" para usar URLs Steam**

### Fase 3: Sistema de Arquivos e Servidor HTTP
1. **Configurar servidor HTTP** para servir frontend e API
2. **Servir arquivos estáticos** (imagens, assets)
3. **Manter operações de sistema de arquivos** (já funcionam no servidor)
4. Criar endpoints para servir demos/imagens quando necessário

### Fase 4: Refatoração UI
1. Remover todas as referências a `window.csdm`
2. Substituir por hooks/utilities
3. Adaptar componentes que dependem de funcionalidades desktop

### Fase 5: Deploy e Testes
1. Configurar ambiente de produção
2. Testes end-to-end
3. Deploy gradual

---

## Considerações Importantes

### Limitações da Versão Web Local:
1. **Acesso Remoto**: Requer servidor acessível na rede (ou configuração de acesso remoto)
2. **Steam Necessário**: "Watch Demo" requer Steam instalado no servidor
3. **Rede Local**: Idealmente usado na mesma rede local
4. **Performance**: Mesma performance do desktop (mesmo hardware)

### Vantagens da Versão Web Local:
1. **Acessibilidade**: Acesso de qualquer dispositivo na rede (PC, tablet, celular)
2. **Sem Instalação**: Não precisa instalar app em cada dispositivo
3. **Atualizações**: Atualizar servidor uma vez, todos os dispositivos usam versão nova
4. **Colaboração**: Múltiplos usuários podem acessar simultaneamente
5. **Multiplataforma**: Funciona em qualquer OS com navegador
6. **Recursos Locais**: Mantém acesso a sistema de arquivos, plugins, jogo
7. **Sem Custos Cloud**: Não requer hospedagem externa

---

## Conclusão

A migração para versão web **local** é **muito mais viável** que uma versão web remota:

- ✅ **Mantém**: UI React, banco de dados, lógica de negócio, **sistema de arquivos**, **plugins**
- 🔄 **Adapta**: Sistema de comunicação (IPC → HTTP), "Watch Demo" (comandos → URLs Steam)
- ❌ **Remove**: Apenas dependências Electron e preload scripts
- ➕ **Adiciona**: Servidor HTTP, API REST, endpoints para servir arquivos

### Principais Mudanças:
1. **Remover Electron** → Servidor HTTP local
2. **IPC → HTTP API** → Endpoints REST
3. **Watch Demo** → URLs Steam (`steam://run/730//+playdemo`)
4. **window.csdm** → Cliente HTTP na UI

### Estrutura Final:
```
Servidor Node.js Local (porta 3000)
├── Frontend React (servido via HTTP)
├── API REST (endpoints /api/*)
├── WebSocket (manter para tempo real)
├── Acesso direto a:
│   ├── Sistema de arquivos
│   ├── Banco PostgreSQL
│   ├── Plugins C++
│   └── Counter-Strike (via Steam URLs)
└── Acessível via navegador em qualquer dispositivo da rede
```

**Estimativa de Esforço**: 1-3 meses de desenvolvimento para uma equipe pequena, significativamente reduzida devido à arquitetura local que mantém a maioria das funcionalidades.

