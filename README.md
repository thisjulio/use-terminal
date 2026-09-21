# use-terminal

> Uma infraestrutura de terminal observável para agentes LLM.

O **use-terminal** dá a um agente uma sessão de terminal real e programável — não apenas uma chamada isolada de `bash`. A visão é permitir executar comandos, manter processos, responder prompts interativos, operar TUIs, acompanhar saída e inspecionar a tela em snapshots úteis para máquinas. Seu diferencial pretendido é unificar essas capacidades em um núcleo aberto e orientado a agentes, com interfaces equivalentes por pacote, REST e MCP; não é uma alegação de que seja o primeiro ou o único projeto nessa área.

> **Estado atual:** o núcleo do MVP está implementado em Bun/TypeScript, incluindo sessões persistentes sobre PTY real via `node-pty`, emulador ANSI básico, snapshots e adapters iniciais REST/MCP.

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

## Capacidades alvo do MVP

- PTY real e shell persistente detectado de `$SHELL`;
- API de baixo nível de PTY e API de alto nível `TerminalSession`;
- stdin/saída byte-a-byte, teclas especiais, sinais e resize;
- múltiplas sessões, jobs, attach/detach e exit code;
- emulador VT/ANSI, buffer, cursor, cores, scrollback e snapshots textuais;
- snapshot bruto JSON de células e snapshot semântico em árvore;
- streaming incremental por `AsyncIterator`;
- espera por texto ou mudança de tela;
- mouse e clipboard;
- REST local com SSE e MCP stdio, usando schemas TypeScript compartilhados;
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

O pacote será a interface principal para integração programática: baixo nível de PTY para controle preciso e `TerminalSession` para operações de alto nível.

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

O backend Linux usa `node-pty` para criar um pseudo-terminal real, com stdin/stdout unificados, eco, sinais e resize. O MVP ainda não é sandbox e o parser VT/ANSI permanece deliberadamente parcial.

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
