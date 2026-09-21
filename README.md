# use-terminal

> Um terminal completo, observável e programável para agentes LLM.

O **use-terminal** dá a um agente uma sessão de terminal real e programável — não apenas uma chamada isolada de `bash`. O objetivo é reproduzir, sobre um PTY real, as capacidades relevantes de um terminal humano: entrada de baixo nível, emulação VT/ANSI, scrollback, viewport, seleção, clipboard, mouse, TUIs e snapshots observáveis. O mesmo núcleo deve oferecer uma API low-level para controle preciso e uma API high-level para automações, expostas de forma equivalente pelo pacote, REST e MCP.

> **Estado atual:** o núcleo executável já possui sessões persistentes sobre PTY real, emulador ANSI básico, snapshots e adapters REST/MCP. A compatibilidade completa com terminais reais, incluindo scrollback, viewport, seleção e todos os modos VT/ANSI, permanece como objetivo em evolução e não deve ser presumida como implementada.

## Por que não apenas uma bash tool?

Uma chamada de shell costuma ser suficiente para comandos curtos, mas perde contexto quando o agente precisa:

- manter um shell e processos persistentes;
- responder `y/n`, menus ou entradas interativas;
- lidar com PTY, ANSI/VT, cursor, cores e resize;
- controlar jobs de longa duração;
- operar TUIs como editores, monitores e instaladores;
- observar a tela atual em vez de inferir tudo de stdout.

O use-terminal trata o terminal como uma sessão viva, com estado e eventos.

## Posicionamento

O problema de oferecer PTY, sessões persistentes e automação de TUIs para agentes já é explorado por outras ferramentas. O use-terminal busca se diferenciar pela combinação de PTY real, estado observável da tela, snapshots em diferentes níveis de representação e um contrato compartilhado entre pacote, REST e MCP. A camada semântica futura será heurística e deverá preservar o snapshot bruto como fonte de verdade.

## Direção do produto

- **Público inicial:** desenvolvedores de agentes LLM, ferramentas de coding e contribuidores.
- **Plataforma inicial:** Linux; núcleo abstraído para futura portabilidade.
- **Runtime:** Bun + TypeScript.
- **Distribuição:** pacote npm programático, com servidor REST localhost e MCP stdio.
- **Licença planejada:** MIT.

## Capacidades alvo

- PTY real e shell persistente detectado de `$SHELL`;
- API de baixo nível de PTY e API de alto nível `TerminalSession`;
- stdin/saída byte-a-byte, teclas especiais, sinais e resize;
- múltiplas sessões, jobs, attach/detach e exit code;
- emulador VT/ANSI compatível, com buffer, cursor, cores, atributos, modos privados, alternate screen e scrollback;
- viewport e seleção por célula com auto-scroll, clipboard e distinção entre scroll local e mouse reporting da TUI;
- suporte progressivo a OSC/DCS, hyperlinks, bracketed paste, focus events, mouse tracking e demais recursos negociados pelo terminal;
- snapshot bruto JSON de células e snapshot semântico em árvore;
- streaming incremental por `AsyncIterator`;
- stream SSE de snapshots textuais, brutos ou semânticos para visualização ao vivo;
- espera por texto ou mudança de tela;
- mouse e clipboard;
- API low-level para bytes, sequências, eventos, snapshots e controle de PTY;
- API high-level para `type`, teclas, clique, scroll, seleção, clipboard, espera por texto/mudança e ações semânticas;
- REST local com SSE e MCP stdio, usando schemas TypeScript compartilhados e paridade entre as duas APIs;
- logs estruturados com redaction de padrões conhecidos de segredos.

Os snapshots semânticos serão heurísticos. O snapshot bruto permanece a fonte de verdade.

## Exemplo de API pretendida

A API abaixo é ilustrativa e ainda não está disponível:

```ts
import { TerminalSession } from "use-terminal";

const terminal = await TerminalSession.create({
  cwd: process.cwd(),
  shell: process.env.SHELL,
  cols: 120,
  rows: 36,
});

await terminal.write("printf 'pronto\\n'");
await terminal.waitForText("pronto");

console.log(terminal.snapshot({ mode: "text" }));
console.log(terminal.snapshot({ mode: "raw" }));

for await (const event of terminal.events()) {
  // bytes, mudanças de tela ou eventos semânticos
  console.log(event);
}
```

Consulte [`PRODUCT.md`](./PRODUCT.md) para o contrato conceitual e [`ROADMAP.md`](./ROADMAP.md) para a ordem de implementação.

## Interfaces planejadas

### Pacote npm

O pacote é a interface principal para integração programática. A camada low-level preserva bytes e eventos crus; a camada high-level fornece operações de automação sem esconder o snapshot bruto nem as limitações de compatibilidade.

### REST localhost

Um servidor iniciado pela CLI deverá oferecer as operações do pacote em `127.0.0.1`, com porta configurável, endpoints request/response, SSE e health/version. CORS ficará desligado por padrão.

### MCP stdio

Um servidor MCP stdio deverá expor as mesmas capacidades e schemas do pacote/REST, permitindo que clientes compatíveis usem o terminal sem uma implementação paralela.

## Segurança e limitações

O MVP assume um **ambiente confiável**:

- não é sandbox;
- não impõe limites obrigatórios de CPU, memória, tempo, output ou concorrência;
- processos podem ter os privilégios do usuário que executa o serviço;
- não exponha o servidor a uma rede sem uma camada de autenticação/isolamento externa;
- localhost, CORS desligado e ausência de autenticação não equivalem a segurança forte;
- sandbox, limites, autenticação remota, multi-tenant e execução distribuída ficam para fases posteriores.

Logs terão redaction de padrões conhecidos, mas nenhum detector de segredos é perfeito.

## Status e roadmap

| Área | Status |
| --- | --- |
| Discovery e visão do produto | ✅ concluído |
| Especificação e roadmap | ✅ concluído |
| Pacote PTY/sessão | 🧭 planejado |
| Emulador VT/ANSI e snapshots | 🧭 planejado |
| REST localhost | 🧭 planejado |
| MCP stdio | 🧭 planejado |
| Árvore semântica, mouse e clipboard | 🧭 planejado |

Veja o [roadmap completo](./ROADMAP.md).

## Desenvolvimento

O núcleo possui implementação executável. O fluxo de desenvolvimento é:

```bash
bun install
bun test
bun run typecheck
```

O backend Linux usa PTY real, com stdin/stdout unificados, eco, sinais e resize. O projeto ainda não é sandbox. A compatibilidade do emulador é construída por uma matriz explícita de recursos, fixtures de bytes, processos reais e TUIs reais; não há promessa de equivalência universal sem testes correspondentes.

### Visualização ao vivo

O endpoint de stream pode entregar frames brutos, preservando as células, cores e
cursor necessários para um frontend Canvas ou SVG:

```text
GET /sessions/:id/stream?mode=raw
```

Cada evento SSE `screen` contém um `snapshot` com `mode: "raw"` e pode ser
renderizado como um novo frame. Para um protótipo simples, o cliente pode
conectar com `EventSource`; para renderização visual, prefira o snapshot bruto
em vez de consultar `/screenshot` periodicamente. O stream não grava vídeo nem
faz throttling: o cliente deve limitar a taxa de pintura se necessário.

### Modo headed

O modo padrão continua headless. Para acompanhar uma sessão no navegador,
crie-a com `headed: true` e abra:

```text
GET /sessions/:id
```

O viewer conecta ao stream bruto, mostra a tela em tempo real e aceita foco de
teclado, entrada de texto, Enter, Tab, Backspace e cliques no terminal. Para
uma demonstração com o `cagent`:

```bash
bun run demo:viewer
```

O comando inicia uma sessão headed em `127.0.0.1`, abre o navegador e mantém a
sessão viva até Ctrl-C. O modo headed é uma visualização/controle local do
mesmo PTY; não cria sandbox nem uma janela gráfica separada para o processo.

O viewer headed usa WebSocket bidirecional em `/sessions/:id/ws`: o servidor
envia um snapshot inicial e eventos de tela, enquanto o navegador envia input,
mouse, wheel e resize no mesmo canal. O viewer encaminha teclas de controle,
setas, navegação, funções, modificadores e arraste. A seleção é feita por
célula diretamente no canvas, com realce visual e cópia via Ctrl/Cmd+C. O
endpoint SSE continua disponível para integrações somente de leitura.

## Referências

- [OpenAI CUA sample app](https://github.com/openai/openai-cua-sample-app)
- [Anthropic tool use cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/tool_use)
- [xterm.js](https://github.com/xtermjs/xterm.js)
- [Pexpect](https://github.com/pexpect/pexpect)
- [termd](https://github.com/termd/termd)
- [`pty(7)`](https://man7.org/linux/man-pages/man7/pty.7.html)
- [`tmux(1)`](https://man7.org/linux/man-pages/man1/tmux.1.html)

## Contribuição

Antes de implementar, leia [`AGENTS.md`](./AGENTS.md). Mudanças de comportamento devem atualizar testes, documentação e o contrato compartilhado quando aplicável.
