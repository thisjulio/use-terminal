# use-terminal — Roadmap

Este roadmap transforma a visão do `PRODUCT.md` em incrementos verificáveis. O objetivo de longo prazo é um terminal completo sobre PTY real, com APIs low-level e high-level equivalentes por pacote, REST e MCP. “Completo” será medido por uma matriz de compatibilidade VT/ANSI e testes reais, não por uma afirmação ilimitada.

## Fase 0 — Fundação e contrato

**Objetivo:** tornar o projeto executável e estabelecer decisões reversíveis.

- [x] Inicializar pacote Bun/TypeScript com comandos de desenvolvimento e teste.
- [x] Definir tipos compartilhados para sessões, eventos, snapshots e erros.
- [x] Definir interfaces de backend PTY e de `TerminalSession`.
- [x] Registrar o contrato de compatibilidade Linux e a política de segurança confiável.
- [x] Configurar CI Linux, lint, formatação e testes.
- [x] Decidir, após spike, a biblioteca de PTY e o parser VT/ANSI mais adequado ao Bun.

**Saída:** pacote mínimo compilável, interfaces documentadas e um spike comparável de PTY/parser.

## Fase 1 — Núcleo npm: PTY e sessão persistente

**Objetivo:** criar o terminal programável básico.

- [x] Implementar criação de PTY e shell detectado de `$SHELL`.
- [x] Implementar `TerminalSession` com `cwd`, dimensões e metadados.
- [x] Enviar texto/bytes, teclas especiais e sinais POSIX.
- [x] Implementar Ctrl-C/Ctrl-D/Ctrl-Z, resize, encerramento e exit code.
- [x] Implementar IDs, status, listagem, attach/detach e jobs persistentes.
- [x] Expor leitura incremental por `AsyncIterator`.
- [x] Adicionar integração com shell real e comandos interativos.

**Saída:** um agente consegue iniciar, operar e acompanhar um shell persistente somente pelo pacote npm.

## Fase 2 — Emulador VT/ANSI e snapshots

**Objetivo:** representar a tela, não somente bytes.

- [x] Integrar ou implementar parser VT/ANSI com cobertura documentada.
- [x] Modelar buffer, cursor, dimensões, atributos, cores e scrollback.
- [x] Implementar snapshot textual determinístico.
- [x] Implementar snapshot bruto de células em JSON.
- [x] Emitir eventos de mudança de tela/células.
- [x] Testar sequências ANSI e TUIs reais.

**Saída:** o agente consegue observar a tela atual com fidelidade suficiente para agir.

## Fase 3 — Adapters REST e MCP

**Objetivo:** disponibilizar o mesmo núcleo pelas interfaces de integração escolhidas.

- [x] Implementar schemas TypeScript compartilhados e validação de entrada/saída.
- [x] Implementar REST localhost com porta configurável.
- [x] Implementar endpoints de sessão, input, sinais, resize, snapshot e stream SSE.
- [x] Implementar health/version.
- [x] Implementar servidor MCP stdio com operações equivalentes.
- [x] Criar testes de paridade entre pacote, REST e MCP.
- [x] Documentar bind `127.0.0.1`, CORS desligado e ausência de autenticação.

**Saída:** um agente pode escolher pacote, REST ou MCP sem trocar o modelo de capacidade.

## Fase 4 — Snapshot semântico

**Objetivo:** reduzir o trabalho de interpretação do agente.

- [x] Definir schema da árvore semântica.
- [x] Representar linhas/células, regiões e foco/cursor.
- [x] Inferir elementos interativos com heurísticas explícitas.
- [x] Representar ações sugeridas e grau de confiança.
- [x] Preservar sempre o snapshot bruto como fonte de verdade.
- [x] Criar fixtures de prompts, menus, tabelas, instaladores e TUIs.

**Saída:** o agente pode escolher ações de alto nível sem perder acesso à tela bruta.

## Fase 5 — Mouse, clipboard e ergonomia

**Objetivo:** cobrir interações além do teclado.

- [x] Suportar eventos e sequências de mouse.
- [x] Definir leitura/escrita de clipboard e limites por ambiente.
- [x] Adicionar ações de clique, movimento e seleção aos schemas.
- [x] Testar TUIs que usam mouse e clipboard.

**Saída:** o MVP amplo cobre os principais canais de interação de um terminal humano.

## Fase 6 — Emulador terminal completo

**Objetivo:** aproximar o comportamento do emulador ao de um terminal real e tornar a compatibilidade mensurável.

- [ ] Definir matriz de compatibilidade VT/ANSI, OSC, CSI, DCS e modos privados.
- [ ] Implementar scrollback persistente, viewport, offset e alternate screen.
- [ ] Implementar seleção por célula/multilinha, auto-scroll durante arraste e clipboard.
- [ ] Separar scroll local do emulador de mouse reporting encaminhado à TUI.
- [ ] Suportar progressivamente bracketed paste, focus events, hyperlinks, clipboard e negociações de recursos.
- [ ] Adicionar fixtures determinísticas por sequência e testes com shells e TUIs reais.
- [ ] Publicar snapshot de viewport, seleção, scrollback e modos ativos sem perder bytes crus.

**Saída:** o viewer e as APIs conseguem reproduzir os fluxos principais de um terminal humano, com limitações documentadas por recurso.

## Fase 7 — APIs low-level e high-level

**Objetivo:** oferecer controle fiel e automação ergonômica sobre o mesmo núcleo.

- [ ] Definir schemas compartilhados para operações low-level e high-level.
- [ ] Expor bytes, sequências, eventos, modos, viewport e snapshots pela API low-level.
- [ ] Expor `type`, teclas, clique, drag, scroll, seleção, clipboard e waits pela API high-level.
- [ ] Garantir paridade de operações, erros e validações entre pacote, REST e MCP.
- [ ] Criar testes de contrato e exemplos de automação para cada adapter.
- [ ] Manter acesso ao snapshot bruto e aos eventos crus em toda operação high-level.

**Saída:** um agente pode escolher fidelidade de terminal ou automação semântica sem trocar de modelo.

## Fase 8 — Robustez, segurança e distribuição

**Objetivo:** preparar uso além de ambientes confiáveis.

- [ ] Avaliar sandbox/container/VM.
- [ ] Adicionar limites de CPU, memória, tempo, output e concorrência.
- [ ] Projetar autenticação forte e exposição remota segura.
- [ ] Avaliar persistência/reconexão após restart.
- [ ] Expandir CI para macOS e Windows quando o backend permitir.
- [ ] Publicar pacote npm e oferecer `bunx`/CLI de diagnóstico.
- [ ] Adicionar benchmarks de latência e capacidade.

**Saída:** base para uso remoto, multiusuário e produção, sem confundir isso com o MVP confiável.

## Definition of Done do objetivo de terminal completo

- Testes unitários do parser/emulador;
- testes de integração PTY;
- testes de contrato REST/MCP;
- snapshots determinísticos;
- teste com pelo menos uma TUI real;
- CI Linux verde;
- quickstart executável;
- documentação que separa implementado, planejado e limitações.
- matriz de compatibilidade atualizada, com cada recurso suportado associado a testes;
- paridade comprovada entre APIs low-level/high-level, pacote, REST e MCP;
- seleção, scrollback, viewport, mouse reporting e clipboard testados no viewer e no núcleo.

## Riscos de produto

| Risco | Mitigação inicial |
| --- | --- |
| Biblioteca de PTY/parser não funcionar bem no Bun | Spike na Fase 0 e backend abstraído |
| “DOM” do terminal gerar falsa confiança | Snapshot bruto obrigatório, heurísticas com confiança |
| Paridade REST/MCP divergir | schemas compartilhados + testes de contrato |
| TUIs dependerem de detalhes não suportados | fixtures reais e matriz explícita de compatibilidade |
| Seleção e scroll confundirem viewer com TUI | estado explícito de viewport, alternate screen e mouse tracking |
| API high-level esconder comportamento do terminal | preservar bytes crus, eventos e snapshot bruto em todas as operações |
| MVP ser usado como sandbox | documentação destacada e bloqueio de claims de segurança |
| Escopo amplo atrasar validação | liberar o núcleo npm antes dos recursos semânticos |
