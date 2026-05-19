# Claude Organizer

"Jira para Claude Code": project-management exposto via MCP. A própria IA usa esse
sistema pra organizar o desenvolvimento dele mesmo (auto-inception).

## Identidade

- **slug**: `claude-organizer`
- **keyPrefix**: `CO` (cards são `CO-1`, `CO-2`...)
- **projectId**: `prj_zrvn6leze9r3`

## Começo de toda sessão — leia esta sequência

Antes de mexer em código:

1. `mcp__claude-organizer__get_active_sprint(projectId="prj_zrvn6leze9r3")`
2. `mcp__claude-organizer__list_unread_comments(projectId="prj_zrvn6leze9r3")` — comentários do usuário que ainda não vi
3. `mcp__claude-organizer__list_cards(projectId="prj_zrvn6leze9r3", sprintId=<da sprint ativa>)` — vê o que tá em andamento; pega summary curtinho de cada um, não descriptionMd
4. Para detalhes de um card específico: `get_card(id)` ou `get_card_by_key(key="CO-12")`

## Fluxo ao trabalhar num card

1. `set_card_status(id, status="in_progress")` antes de começar
2. Implementar
3. `add_comment(cardId, bodyMd=...)` com progresso/decisões
4. `set_card_status(id, status="review")` quando achar pronto → espera user validar
5. `set_card_status(id, status="done")` somente depois do "ok" do user

## Criando novos cards

- Sempre passe `summary` curtinho (1 linha, ~100 chars, linguagem natural) — aparece em `list_cards` e no board
- `descriptionMd` para detalhes longos (markdown)
- Sem `sprintId` = vai pro backlog

## Stack

- **Monorepo pnpm**: `packages/{db,core,mcp,api,web}`
- **DB**: Postgres 16 (Docker `claude-organizer-postgres`, porta 5544) + Drizzle ORM
- **API**: Fastify v5 em `127.0.0.1:4400`
- **MCP**: `@modelcontextprotocol/sdk` stdio, roda via tsx
- **Web**: Nuxt 4 + Nuxt UI v4 + Pinia 3 em `127.0.0.1:4401`
- **Drag-and-drop**: `vue-draggable-plus`
- **Markdown**: `marked` (componente `AppMarkdown`, NÃO usar `@nuxtjs/mdc` — quebra interop)

## Padrões obrigatórios

1. **Nuxt UI v4 — sempre consulte o MCP antes de usar componente novo**
   - Use `mcp__nuxt-ui-remote__search-components` ou `get-component`
   - Componentes NÃO existem: `UDashboardSidebarLinks`, `UDashboardPanelContent` (são v3)
   - Layout correto: `UDashboardGroup > UDashboardSidebar + <slot/>` (no layout); cada página coloca seu próprio `UDashboardPanel` com slots `#header` e `#body`

2. **Imports TS no monorepo: sem `.js` extension**
   - drizzle-kit usa require CJS e falha com `.js` em imports relativos
   - Use `import { x } from "./y"`, NÃO `from "./y.js"`

3. **Markdown rendering**
   - `<AppMarkdown :value="..." />` no client (usa `marked`, v-html)
   - Conteúdo é confiável (single-user local), sem sanitização agora

4. **IDs prefixados**: `prj_xxx`, `crd_xxx`, `spr_xxx`, `cmt_xxx`, `tag_xxx`, `doc_xxx`, `rdm_xxx`. Cards têm também `key` legível (`CO-N`) gerado em transação atômica via `UPDATE projects SET next_key_seq = next_key_seq + 1 RETURNING`.

5. **Multi-projeto**: tools do MCP recebem `projectId` explícito. Não usar `slug` direto.

## Comandos do dia-a-dia

```bash
# Subir Postgres (se reboot)
pnpm db:up

# Dev — terminais separados
pnpm dev:api     # http://127.0.0.1:4400
pnpm dev:web     # http://127.0.0.1:4401

# Typecheck
pnpm typecheck   # backend + web

# Migrations
pnpm db:generate  # gera SQL após mudar schema
pnpm db:migrate   # aplica
```

## Após reiniciar Claude Code

O MCP `claude-organizer` é carregado automaticamente (registrado em user scope).
Postgres precisa estar UP. Se subir API/Web, são processos manuais.

Se uma tool MCP nova foi adicionada no código mas não aparece, é porque o
processo MCP server foi iniciado com versão antiga — basta reiniciar o Claude
Code novamente.

## Decisões importantes (vão virar ADRs em /docs quando CO-9 for feito)

- **Drizzle > Prisma**: TS-native, sem etapa de generate, bundle pequeno
- **stdio + UI separada**: MCP local, Nuxt fala com API REST (não com MCP direto)
- **marked vs @nuxtjs/mdc**: MDC tem cadeia de deps com problemas de interop ESM (debug 4.4.3). Marked é ESM-puro e simples
- **Position de cards**: hoje só status persiste no drag; reordenar dentro da coluna ainda não persiste `position` (débito conhecido)
- **Não regerar keys ao mudar prefixo**: igual Jira. CO-5 deletado nunca volta; mudar prefix afeta só cards novos

## Onde quero ir (sprint ativa: Fase 2)

Cards por prioridade decrescente — ver no MCP `list_cards`. Próximos depois do que já está done:
CO-19 skeleton, CO-5 detalhe do card, CO-2 editor TipTap, CO-23 WebSocket, CO-3 comentários UI, CO-4 tags, CO-7 sprints page.

Fase 3 (planned): CO-8 roadmaps, CO-9 docs, CO-10 full-text search.
Fase 4 (planned): CO-11 skill, CO-12 LSP MCP.
