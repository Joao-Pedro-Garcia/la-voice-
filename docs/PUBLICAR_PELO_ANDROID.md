# Publicar o LA VOICE usando só o celular Android

Este roteiro coloca o jogo na internet com HTTPS (necessário para o microfone), multiplayer online e voz, sem computador. Tudo é feito no navegador do celular (Chrome).

## O que depende de conta externa

| Etapa | Onde | Conta necessária | Custo |
|---|---|---|---|
| Código do jogo | GitHub (`joao-pedro-garcia/la-voice-`) | Sua conta do GitHub (já existe, o projeto está lá) | Grátis |
| Hospedagem com HTTPS | Render (render.com) | Conta no Render, criada com **"Sign in with GitHub"** | Plano gratuito |
| Interpretação por IA para frases difíceis (opcional) | Anthropic | Chave de API (`ANTHROPIC_API_KEY`) | Pago por uso |
| Voz no Firefox ou em navegadores sem voz (opcional) | Um serviço de transcrição compatível | Depende do serviço escolhido | Varia |

Nada disso é feito automaticamente: você aprova cada etapa nas suas contas. O Claude Code não tem acesso à sua conta do Render.

## O que já está pronto no projeto

- **`render.yaml`**: configuração do Render ("Blueprint"). Compila o jogo, inicia o servidor, verifica a saúde em `/api/health` e publica de novo a cada commit.
- **Servidor preparado para o proxy HTTPS do Render:**
  - redireciona HTTP → HTTPS;
  - envia `Permissions-Policy: microphone=(self)`, HSTS e CSP;
  - usa o IP real do jogador nos limites anti-abuso;
  - comprime os arquivos (~1,3 MB → ~0,4 MB);
  - aceita WebSocket só do próprio site.
- **Voz no celular:** modo **"Tocar para falar"** automático. Toque no microfone e diga uma frase. O jogo não abre um segundo fluxo de microfone, que no Android e no iPhone bloqueia o reconhecedor de voz do sistema.
- **Instalação como app:** manifesto para "Adicionar à tela inicial", que abre em tela cheia.

## Passo 1: deixar o código no branch que o Render vai publicar

O projeto está no branch `ccr-d6e96ab1-8agnlv`. Há duas opções:

- **A (mais simples):** usar esse branch direto no Render (Passo 3).
- **B (recomendada):** juntar ao branch principal. No celular, abra `github.com/joao-pedro-garcia/la-voice-`, toque em **Pull requests → New**, escolha `base: main` e `compare: ccr-d6e96ab1-8agnlv`, depois **Create pull request** e **Merge**. Se preferir, o Claude Code pode abrir esse pull request quando você pedir.

## Passo 2: criar a conta no Render

1. No Chrome do Android, abra **render.com** e toque em **Get Started**.
2. Escolha **GitHub** e autorize o Render.
3. Quando o GitHub perguntar a quais repositórios dar acesso, escolha **Only select repositories** e marque `la-voice-`.

> Dica: ative **"Versão para computador"** no menu ⋮ do Chrome se algum botão do painel do Render ficar escondido na tela pequena.

## Passo 3: criar o serviço pelo Blueprint

1. No painel do Render: **New + → Blueprint**.
2. Escolha o repositório `la-voice-` e o branch (`main`, ou `ccr-d6e96ab1-8agnlv` na opção A).
3. O Render lê o `render.yaml` e mostra o serviço **la-voice** (plano Free).
4. Ele pede os valores opcionais. Pode deixar **em branco** para começar:
   - `ANTHROPIC_API_KEY`: interpretação por IA de frases muito fora do vocabulário. Sem ela, o jogo usa o interpretador próprio, que já entende o catálogo, sinônimos e frases.
   - `LAVOICE_STT_URL` / `LAVOICE_STT_KEY`: só se quiser voz em navegadores sem reconhecimento próprio (Firefox).
5. Toque em **Apply**. A primeira compilação leva de 2 a 5 minutos. Acompanhe em **Logs** até aparecer `LA VOICE rodando em ...`.

## Passo 4: abrir e testar no celular

1. Abra o endereço mostrado pelo Render, algo como `https://la-voice-xxxx.onrender.com`. O HTTPS é automático.
2. **Jogar → Entrar no mundo.**
3. Toque no **microfone** (botão roxo embaixo). Na primeira vez, o Chrome pergunta: toque em **Permitir**.
4. Diga "espada de fogo". A frase aparece na tela e a espada surge na mão do personagem.
5. Multiplayer: **Multiplayer → Criar sala**. Toque no ponto verde no canto superior para copiar ou compartilhar o convite (link com `?sala=CÓDIGO`). Quem abrir o link entra direto na tela de código.

### Instalar como app (opcional)

Chrome ⋮ → **Adicionar à tela inicial** (ou **Instalar app**). O jogo abre em tela cheia pelo ícone.

## Navegadores compatíveis com voz

| Aparelho | Navegador | Voz | Observação |
|---|---|---|---|
| Android | **Chrome** | Sim | Usa o reconhecimento do Google; precisa de internet. |
| Android | Edge, Samsung Internet | Geralmente sim | Depende da versão; se não funcionar, use o Chrome. |
| Android | Firefox | Não | Digite os comandos ou configure `LAVOICE_STT_URL`. |
| iPhone | **Safari** (iOS 14.5+) | Sim | Exige **Ajustes → Geral → Teclado → Ativar Ditado**. |
| iPhone | Chrome ou outros | Incerto | Não testado; se não houver voz, use o Safari. |

Sem voz disponível, o campo de texto funciona igual, com o mesmo interpretador.

## Se o microfone não funcionar

- **"Microfone bloqueado":** toque no cadeado ao lado do endereço → **Permissões → Microfone → Permitir**, depois recarregue.
- **Android:** confira **Configurações → Apps → Chrome → Permissões → Microfone → Permitir**.
- **"Microfone em uso":** feche apps de chamada ou gravação.
- **"Precisa de internet":** o reconhecimento do Chrome usa os servidores do Google.
- **iPhone:** ative o Ditado (veja a tabela) e use o Safari.

## Limites do plano gratuito do Render

- **Dorme após 15 minutos sem jogadores.** O primeiro acesso depois disso leva cerca de 1 minuto para "acordar". Enquanto houver alguém conectado, o servidor fica ativo, porque as mensagens do jogo contam como tráfego.
- **Sem disco permanente.** O progresso do **multiplayer** (nível, conquistas no servidor) é apagado quando o serviço reinicia ou é publicado de novo. O progresso do **modo solo** fica no próprio celular e não é afetado. Para guardar o progresso online, use um plano pago com disco: descomente o bloco `disk` no `render.yaml` e defina `LAVOICE_DATA=/var/data/profiles.json`.
- **Salas em memória.** Se o servidor reiniciar, as salas abertas acabam e os jogadores precisam criar outra.
- **Um único servidor.** Até 8 jogadores por sala e várias salas simultâneas. Para centenas de jogadores ao mesmo tempo, seria preciso um plano maior.

## Atualizar o jogo depois

Cada commit no branch escolhido republica o jogo sozinho (`autoDeployTrigger: commit`). Pelo Claude Code no celular: peça a mudança, peça o commit e o push, e acompanhe a nova versão em **Render → la-voice → Events**.
