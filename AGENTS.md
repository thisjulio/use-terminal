# AGENTS.md

Instruções para agentes de código trabalhando no repositório `use-terminal`.

## Contexto do projeto

O use-terminal é uma infraestrutura de terminal interativo para agentes LLM. O produto deve oferecer um PTY real, sessão persistente, emulação VT/ANSI, snapshots da tela e adapters para pacote npm, REST localhost e MCP stdio. Leia primeiro:

1. [`README.md`](./README.md) — visão pública e status;
2. [`PRODUCT.md`](./PRODUCT.md) — decisões de produto e limites;
3. [`ROADMAP.md`](./ROADMAP.md) — ordem de entrega.

A documentação pode descrever alvos futuros. Não apresente uma capacidade como implementada sem código e teste que a comprovem.

## Princípios de implementação

- Preserve a separação entre backend PTY, sessão, emulador, snapshots, eventos e adapters.
- Faça o pacote programático ser o núcleo; REST e MCP devem ser adapters finos.
- Use schemas TypeScript compartilhados para entradas, saídas, eventos e erros.
- Preserve bytes crus e metadados suficientes para diagnóstico; representações semânticas são derivadas.
- Não esconda incerteza de heurísticas da árvore semântica: mantenha o snapshot bruto disponível.
- Prefira APIs assíncronas e canceláveis para processos longos.
- Gere IDs de sessão estáveis e mantenha transições de estado explícitas.
- Evite acoplamento do domínio a HTTP, MCP ou a um framework de agente.
- O alvo inicial é Linux, mas abstraia pontos que possam mudar em macOS/Windows.

## Segurança

O MVP é para ambiente confiável, não é sandbox e pode executar comandos com os privilégios do usuário. Portanto:

- não introduza claims de isolamento sem implementar e testar uma fronteira real;
- não habilite bind remoto por padrão;
- mantenha `127.0.0.1`, CORS desligado e ausência de autenticação explicitamente documentados;
- trate stdin, stdout, logs, snapshots e eventos como possíveis fontes de segredos;
- aplique redaction antes de persistir ou emitir logs quando apropriado;
- nunca adicione telemetria, upload ou execução remota silenciosamente;
- qualquer futura mudança para rede, multi-tenant ou código não confiável exige revisão de segurança.

## Workflow obrigatório

1. Leia os documentos de contexto e localize o item correspondente no roadmap.
2. Inspecione o código e os testes existentes antes de editar.
3. Faça uma mudança pequena, com tipos explícitos e erro observável.
4. Adicione ou atualize testes junto com a mudança.
5. Atualize documentação/contratos se comportamento público mudar.
6. Execute os testes relevantes e depois a suíte completa disponível.
7. Descreva no PR/commit o que mudou, como foi verificado e quais limitações permanecem.

## Contratos e compatibilidade

Mudanças em operações públicas devem atualizar, na mesma alteração:

- tipos e schemas TypeScript;
- implementação do pacote;
- adapter REST;
- adapter MCP;
- testes de contrato/paridade;
- exemplos e documentação.

Não crie uma operação em somente um adapter sem registrar explicitamente a exceção no roadmap. Erros devem ter forma estável, mensagem útil e contexto seguro para logs.

## PTY e emulador

- Teste com processos reais e com fixtures determinísticas de bytes.
- Diferencie bytes recebidos do PTY de mudanças derivadas no estado da tela.
- Cubra dimensões, cursor, scrollback, cores/atributos, sinais e encerramento.
- Não confie apenas em testes de `echo`; inclua prompts, entrada sem newline, processos longos e pelo menos uma TUI real.
- Faça resize e encerramento idempotentes quando possível.
- Evite bloquear o event loop do Bun durante leitura/escrita.

## Testes mínimos por mudança

- Parser/emulador: testes unitários e snapshots determinísticos.
- PTY/sessão: teste de integração em Linux com shell real.
- REST/MCP: testes de contrato e paridade com a API do pacote.
- Streaming: ordem, backpressure, cancelamento e encerramento.
- Segurança/logs: redaction e ausência de segredo em casos de teste.
- Quickstart: deve seguir os comandos documentados em uma instalação limpa.

Se uma funcionalidade não puder ser testada de modo confiável, reduza o escopo ou registre a limitação; não substitua a verificação por uma promessa.

## Estilo

- TypeScript estrito e nomes que descrevam a semântica do terminal.
- Funções pequenas, dependências justificadas e interfaces focadas.
- Comentários explicam decisões e limitações, não repetem o código.
- Commits pequenos e com uma intenção.
- Não reformate arquivos não relacionados.
- Não adicionar dependências sem verificar licença, manutenção, compatibilidade Bun/Linux e impacto no bundle.

## Critérios para revisão

Uma mudança está pronta quando:

- o comportamento está alinhado ao `PRODUCT.md` e à fase do `ROADMAP.md`;
- a API pública e seus adapters permanecem coerentes;
- testes reproduzem o caso principal e falhas importantes;
- logs/snapshots não vazam segredos desnecessariamente;
- documentação distingue implementado de planejado;
- comandos de validação passam em CI Linux.
