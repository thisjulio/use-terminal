# use-terminal — Product Specification

## Visão

**use-terminal** é uma infraestrutura de terminal observável para agentes LLM: não apenas uma função `bash`, mas uma sessão interativa real que preserva estado, representa a tela e permite operar programas de terminal como um usuário.

O produto nasce para coding agents trabalhando em repositórios locais. O núcleo será um pacote npm em Bun/TypeScript, com adapters equivalentes para REST local e MCP stdio. PTY, sessões persistentes e automação de TUI já são abordagens presentes no ecossistema; a diferenciação pretendida está em reuni-las sob um contrato único, observável e orientado a agentes.

> Status: especificação inicial pós-discovery. As capacidades marcadas como MVP são alvo do produto, não uma afirmação de que já estão implementadas.

## Problema

Uma tool de shell tradicional é inadequada quando o agente precisa:

- manter um shell persistente e seus processos;
- responder prompts, menus e confirmações interativas;
- operar TUIs e programas que dependem de PTY, ANSI/VT, cursor e dimensões;
- observar uma tela atual, não apenas acumular stdout;
- acompanhar processos longos sem bloquear a chamada;
- compartilhar o mesmo contrato entre código TypeScript, REST e MCP.

## Usuários e casos de uso

### Usuário inicial

- Desenvolvedores de agentes LLM;
- Desenvolvedores de ferramentas de coding;
- Contribuidores do projeto.

### Casos prioritários

1. Executar comandos em um shell persistente.
2. Responder prompts `y/n`, menus e entradas interativas.
3. Operar programas TUI, incluindo instaladores, editores e monitores.
4. Acompanhar processos longos e sua saída incremental.
5. Automatizar fluxos de desenvolvimento e testes.
6. Inspecionar a tela do terminal em formato textual e estruturado.

## Proposta de valor

Para agentes que precisam agir como usuários de um computador, o use-terminal oferece uma sessão de terminal fiel, observável e programável. Diferente de uma `bash tool`, ele mantém estado de execução, modela a tela e disponibiliza as mesmas operações por pacote, REST e MCP. A proposta não é reivindicar novidade absoluta, mas reduzir a fragmentação entre essas capacidades e oferecer uma base coerente para agentes.

## Princípios

- **Terminal real primeiro:** PTY e semântica de sessão são a fonte de verdade.
- **Observável por padrão:** toda operação importante deve ser inspecionável por eventos e snapshots.
- **Contrato único:** adapters não devem criar capacidades divergentes.
- **Bytes quando necessário, estrutura quando útil:** o agente pode operar em baixo nível ou consumir snapshots ricos.
- **Composição:** o pacote deve ser útil sem servidor e o servidor deve ser um adapter fino.
- **Honestidade de segurança:** o MVP é para ambiente confiável e não é sandbox.

## Escopo funcional do MVP amplo

### Sessões e PTY

- Criar uma sessão com shell detectado de `$SHELL` e `cwd` configurável.
- Expor uma API de baixo nível de PTY e uma API de alto nível `TerminalSession`.
- Manter shell, subprocessos e jobs na mesma sessão.
- Enviar bytes, texto, teclas especiais e sinais POSIX.
- Suportar Ctrl-C, Ctrl-D, Ctrl-Z, resize, encerramento e exit code.
- Listar, anexar e desanexar sessões.
- Expor ID estável, status, PID/PGID, cwd, executável, dimensões, timestamps, exit code, último snapshot e metadados.

### Emulação e snapshots

- Interpretar ANSI/VT com buffer de tela, cursor, cores, atributos, dimensões e scrollback.
- Snapshot textual em modos selecionáveis: linhas visíveis, cursor/dimensões, estilos/células e árvore.
- Snapshot bruto: JSON com dimensões, células, texto, cursor e atributos.
- Snapshot semântico: árvore JSON com linhas, regiões e elementos interativos inferidos quando possível.
- O modelo semântico é heurístico e deve indicar incerteza; não substitui o estado bruto.
- Mouse e clipboard são parte do alvo do MVP, sem esconder as sequências/limitações do terminal.

### Operações assíncronas

- Retornar rapidamente um `session_id` para operações longas.
- Fornecer `AsyncIterator` no pacote.
- Emitir bytes crus do PTY e mudanças de tela/células; eventos semânticos podem ser derivados.
- Aguardar texto ou mudança de tela como operação explícita.
- Obter snapshot sob demanda sem interromper o processo.

### Interfaces

- Pacote npm/Bun como núcleo programático.
- API REST em `127.0.0.1`, com porta configurável, endpoints request/response, SSE, health/version e CORS desligado por padrão.
- Servidor MCP stdio no primeiro protótipo.
- REST e MCP devem expor as mesmas operações e validações, geradas/validadas por schemas TypeScript compartilhados.

### Observabilidade

- Logs estruturados completos, com redaction de padrões conhecidos de tokens, chaves e senhas.
- Eventos devem ter timestamp, session ID, tipo e payload apropriado.
- A gravação não deve transformar segredo em texto persistido por acidente; o redaction é uma proteção, não uma garantia perfeita.

## Fora do MVP

- Sandbox, container ou VM;
- limites obrigatórios de CPU, memória, tempo e output;
- autenticação forte e multi-tenant remoto;
- persistência de sessões após restart;
- interface web humana;
- execução distribuída;
- CI Windows/macOS (o núcleo deve ser abstraído para futura portabilidade).

## Segurança e limites conhecidos

O MVP assume um **ambiente confiável**. O processo do use-terminal pode executar comandos com os privilégios do usuário e não deve ser exposto a rede sem uma camada de segurança externa. O padrão de HTTP é bind em localhost, sem autenticação e com CORS desativado; isso reduz exposição acidental, mas não constitui uma fronteira de segurança.

Não executar código ou comandos não confiáveis com este MVP. Sandbox e limites devem ser tratados como requisito de uma futura versão antes de uso remoto ou multi-tenant.

## Critérios de sucesso

- Criar e manter uma sessão bash/shell persistente por pacote.
- Executar comandos comuns via API.
- Responder uma confirmação interativa e operar uma TUI real.
- Capturar snapshots textual, bruto estruturado e semântico.
- Receber saída incremental sem polling obrigatório.
- Executar a mesma operação por pacote, REST e MCP.
- Ter testes unitários do emulador, integração PTY, contratos REST/MCP, snapshots determinísticos, TUI real, CI Linux e quickstart executável.

## Referências e contexto

- [OpenAI CUA sample app](https://github.com/openai/openai-cua-sample-app) — uso de agentes para operar ambientes computacionais.
- [Anthropic tool use cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/tool_use) — padrões de tool use.
- [xterm.js](https://github.com/xtermjs/xterm.js) — emulador/terminal para a web e referência de compatibilidade.
- [Pexpect](https://github.com/pexpect/pexpect) — controle de programas interativos em pseudo-terminal.
- [termd](https://github.com/termd/termd) — biblioteca/daemon de manipulação de terminal.
- [`pty(7)`](https://man7.org/linux/man-pages/man7/pty.7.html) e [`tmux(1)`](https://man7.org/linux/man-pages/man1/tmux.1.html) — fundamentos operacionais de PTY e sessões persistentes.
