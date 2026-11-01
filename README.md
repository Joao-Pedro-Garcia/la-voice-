# LA VOICE

Jogo 3D no navegador em que **tudo o que você fala vira algo no mundo**. Diga "espada de fogo", "dragão", "quero voar", "chuva" ou descreva algo ("um animal enorme que consiga voar") e o jogo interpreta a fala e cria a arma, a criatura, o poder ou o clima correspondente. Há combate, ondas de monstros, progressão e multiplayer online.

## Como executar

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run build      # compila o cliente para dist/
npm start          # servidor em http://localhost:8787 (jogo + multiplayer)
```

Abra `http://localhost:8787`, clique em **Jogar**, autorize o microfone e fale.

Para desenvolver com recarga automática:

```bash
npm run dev        # cliente em http://localhost:5173 e servidor em :8787 (o Vite encaminha /api e /ws)
```

> O microfone só funciona em `localhost` ou em HTTPS (regra dos navegadores). Para jogar pelo celular na rede local, publique atrás de HTTPS (por exemplo, um proxy reverso com certificado).

## Como jogar

| Ação | Teclado/mouse | Toque |
|---|---|---|
| Mover | WASD | joystick à esquerda |
| Olhar | clique no jogo (trava o mouse) e mova | arrastar a metade direita da tela |
| Atacar / defender | clique esquerdo / botão direito ou Q | ⚔️ / 🛡️ |
| Esquivar / golpe especial | Shift / F | 🌀 / ✨ |
| Pular (subir no voo) / descer no voo | Espaço / Ctrl ou C | ⬆️ / ⬇️ |
| Microfone liga/desliga | M | botão do microfone |
| Segurar para falar (modo "aperte para falar") | V | segurar o botão do microfone |
| Digitar um comando | T ou Enter | campo de texto |
| Trocar arma / jogadores / menu | 1–5 / Tab / Esc | slots / 👥 / ☰ |

O modo **Aventura** traz ondas de monstros cada vez mais fortes. O modo **Criativo** não tem inimigos.

## Configurar o reconhecimento de voz

A voz passa por cinco camadas:

1. **Reconhecimento** (áudio → texto), em `src/voice/`:
   - **Navegador (padrão):** usa a Web Speech API, disponível no Chrome, Edge e Safari. No Chrome o áudio é processado pelo serviço do Google; no Safari pode ser processado no próprio aparelho.
   - **Servidor (opcional):** o cliente grava o trecho detectado e envia para `/api/stt`. O servidor repassa a um serviço de transcrição no formato `/audio/transcriptions`, como um servidor whisper.cpp local. Configure:
     ```bash
     LAVOICE_STT_URL=http://127.0.0.1:8080/v1/audio/transcriptions
     LAVOICE_STT_KEY=...      # opcional, fica só no servidor
     LAVOICE_STT_MODEL=base   # opcional
     ```
     Depois escolha **Configurações → Voz → Reconhecedor → Servidor**. Navegadores sem Web Speech (Firefox) usam esse modo automaticamente quando ele está configurado.
   - **Texto:** sempre disponível pelo campo de comando.
2. **Interpretação** (`shared/nlu/`): um interpretador próprio, offline, em português e inglês. Ele normaliza acentos, plurais e diminutivos, tolera erros do reconhecedor (distância de edição), entende sinônimos, frases completas, vários pedidos numa mesma frase ("um lobo de gelo e uma espada de fogo"), quantidades ("três lobos", "exército"), tamanhos, elementos e negações ("não quero chuva").
3. **Classificação:** arma, criatura, habilidade, ambiente ou objeto. Quando nada é nomeado, a classificação vem das características pedidas ("algo para me proteger" → escudo; "animal enorme que voa" → dragão grande). Pedidos impossíveis ou abstratos recebem uma alternativa explicada ("quero um carro" → super velocidade; "quero ser invencível" → escudo reforçado).
4. **Geração** (`shared/sim/generator.js`): monta atributos, raridade e aparência, com equilíbrio e desbloqueio por nível. Um item ainda bloqueado vem como versão "filhote" ou "aprendiz", nunca como recusa.
5. **Execução** (`shared/sim/world.js`): coloca o resultado no mundo.

**Interpretação externa (opcional).** Com `ANTHROPIC_API_KEY` definida no servidor, frases que o interpretador local entende com baixa confiança são enviadas a um modelo de linguagem (Claude). A resposta é restrita aos ids do catálogo. O modelo padrão é `claude-opus-5-5` e pode ser trocado com `LAVOICE_LLM_MODEL`. Há cache de resultados, tempo limite e um "disjuntor" que pausa o serviço após falhas. Sem chave ou sem internet, o jogo usa apenas o catálogo local. A chave nunca vai para o cliente.

**Proteção contra falsos reconhecimentos.** O microfone é aberto com cancelamento de eco, supressão de ruído e filtro passa-altas. Um detector de atividade de voz próprio (`src/voice/vad.js`) combina um piso de ruído adaptativo, a energia na banda da fala e tempos mínimos de ataque e liberação. O limiar sobe enquanto o próprio jogo emite som, uma transcrição só é aceita se houve voz real detectada pouco antes, e música e efeitos baixam de volume enquanto você fala. A sensibilidade é ajustável e há um teste de microfone em **Configurações → Voz**.

## Multiplayer

```bash
PORT=8787 npm start
```

- **Multiplayer → Criar sala** gera um código de 5 caracteres. Clique no indicador de conexão para copiar o convite (link `?sala=CÓDIGO`).
- Os amigos entram em **Multiplayer → Entrar com código**.
- O servidor é **autoritativo**: valida movimento (velocidade máxima), recargas, energia e limites; interpreta a fala de cada jogador individualmente; simula criaturas, projéteis e combate; e envia estado a 10 Hz e eventos em tempo real.
- **Reconexão:** se a conexão cair, o cliente reconecta sozinho e retoma a mesma sessão. O jogador fica na sala por 45 s marcado como offline.
- **Persistência:** os perfis (nível, XP, conquistas, histórico) ficam em `data/profiles.json` (caminho configurável com `LAVOICE_DATA`). São indexados por um token secreto do navegador, e o arquivo guarda só o hash do token.
- A partida tem PvP opcional, até 8 jogadores por sala e limite de mensagens por jogador.

## Gráficos e desempenho

Perfis de qualidade em `src/core/quality.js`: celular básico, celular intermediário, celular avançado e computador. O perfil é detectado pelo aparelho e depois **ajustado pelo FPS real**. Quando falta desempenho, o jogo reduz primeiro a resolução dinâmica, depois as partículas, a distância de vegetação e por fim as sombras, preservando o detalhe de personagens, armas e criaturas próximas. O jogo também usa:

- vegetação instanciada em blocos com dois níveis de detalhe e corte por distância e por visão;
- LOD das criaturas por distância (peças pequenas e sombras desligadas de longe);
- partículas em GPU com orçamento fixo e pools;
- caches de geometria, material e textura, com descarte de recursos ao remover entidades;
- carregamento do mundo em etapas, com barra de progresso.

Tudo é procedural (modelos, texturas, animações e sons), então não há arquivos de textura para comprimir em KTX2/Basis. Em vez disso, o tamanho das texturas geradas segue o perfil de qualidade.

## Testes

```bash
npm test           # 92 testes: interpretação, catálogo, geração, combate, IA, progressão, persistência, VAD,
                   # multiplayer real (WebSocket), reconexão e API HTTP
npm run build && npm run test:e2e   # 23 verificações no Chromium: menu, mundo, permissão de microfone
                                     # (dispositivo falso), armas, criaturas, habilidades, clima, pausa,
                                     # salvamento, multiplayer com 2 abas, reconexão, celular e console sem erros
```

As capturas de tela do e2e ficam em `test-results/`.

## Estrutura

```
shared/            código comum a cliente e servidor
  catalog/         armas, criaturas, variantes, habilidades, clima e objetos
  nlu/             normalização, léxico, conceitos alternativos e interpretador
  sim/             mundo, IA, habilidades, gerador, progressão e sala (protocolo de jogo)
  world.js         relevo, construções e posições determinísticas
server/            HTTP, WebSocket, salas, persistência, LLM opcional e STT opcional
src/
  core/            motor, entrada e qualidade adaptativa
  world/           terreno, céu e dia/noite, água, vegetação, construções e clima
  entities/        personagem, criaturas (12 arquétipos) e armas (17 tipos × elementos)
  fx/              partículas e efeitos de habilidades
  voice/           microfone, VAD, reconhecedores e controlador de voz
  audio/           sons procedurais, ambiente e música
  game/            cliente de jogo, controlador do jogador, visuais e objetos
  net/             sessão local (solo) e online (WebSocket)
  ui/              HUD e menus
  save/            configurações e perfil local
preview/           páginas de inspeção dos modelos (npx vite → /preview/creatures.html etc.)
tests/             unitários, integração e e2e
docs/CONTRACTS.md  contratos entre os módulos 3D
```

## Limitações conhecidas

- **Voz:** a Web Speech API depende do navegador. O Firefox não a oferece, então nele use o reconhecimento pelo servidor (se configurado) ou digite. No Chrome o reconhecimento passa pelos servidores do Google e precisa de internet. O processamento só no aparelho depende do Safari ou de um servidor whisper local.
- **"Voz individual" no multiplayer:** cada jogador fala no próprio microfone e a fala de cada um é interpretada separadamente. Não há chat de voz entre jogadores.
- **Testes de desempenho:** rodaram num Chromium sem GPU (renderização por software). No perfil "celular básico" o jogo ficou em cerca de 50 FPS logo após entrar no mundo e cerca de 15 FPS com dragão, lobos, chuva e efeitos ativos ao mesmo tempo, mas esses números não representam um aparelho real. Ainda não foi medido em celulares e GPUs reais.
- **Interpretação:** o interpretador local cobre o catálogo, cerca de 60 variantes de animais, sinônimos e conceitos alternativos. Frases muito fora do vocabulário só são entendidas com o serviço externo opcional.
- **Modelos:** criaturas pequenas têm de 3 a 6,6 mil triângulos no detalhe máximo (alvo era menos de 3 mil). No detalhe baixo ficam em cerca de 1,2 mil.
- **Física:** colisão simples, com caixas para construções e círculos para objetos; não há motor de física rígida.
- **"Sair":** o navegador só fecha abas abertas por script. Por isso o botão salva o progresso e mostra a tela de despedida.
