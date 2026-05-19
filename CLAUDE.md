# Claude Organizer

"Jira para Claude Code": project-management exposto via MCP. A própria IA usa esse
sistema pra organizar o desenvolvimento dele mesmo (auto-inception).

## Use a skill `claude-organizer`

**Como** trabalhar (orientar-se no início, fluxo de cards, comentários, docs) está na
skill `claude-organizer` — ela dispara sozinha. **O que** fazer (sprint ativa, cards,
backlog, comentários, docs) é a fonte da verdade e vive **no MCP**, não aqui. Não
duplique estado neste arquivo: consulte via `mcp__claude-organizer__*`.

Este projeto neste MCP:

- **slug**: `claude-organizer`
- **keyPrefix**: `CO` (cards são `CO-1`, `CO-2`...)
- **projectId**: `prj_zrvn6leze9r3`

Detalhes de arquitetura, modelo de dados e decisões (ADRs) estão nos **docs** do
projeto (via `list_docs`/`read_doc`). Leia de lá antes de reinventar.

## Stack

- **Monorepo pnpm**: `packages/{db,core,mcp,api,web}`
- **DB**: Postgres 16 (Docker `claude-organizer-postgres`, porta 5544) + Drizzle ORM
- **API**: Fastify v5 em `127.0.0.1:4400`
- **MCP**: `@modelcontextprotocol/sdk` stdio, roda via tsx
- **Web**: Nuxt 4 + Nuxt UI v4 + Pinia 3 em `127.0.0.1:4401`

## Padrões obrigatórios (específicos deste projeto)

1. **Nuxt UI v4 — consulte o MCP `nuxt-ui-remote` antes de usar componente novo**
   (`search-components`/`get-component`). Não existem (eram v3):
   `UDashboardSidebarLinks`, `UDashboardPanelContent`. Layout: `UDashboardGroup >
   UDashboardSidebar + <slot/>`; cada página com seu `UDashboardPanel` (slots
   `#header`/`#body`).
2. **Imports TS sem extensão `.js`** — drizzle-kit usa require CJS e falha com `.js`
   em imports relativos. Use `from "./y"`, não `from "./y.js"`.
3. **Markdown**: `<AppMarkdown :value="..." />` (marked) no client; editor é `UEditor`
   com `content-type="markdown"`. NÃO usar `@nuxtjs/mdc` (quebra interop ESM).
4. **IDs prefixados** (`prj_`, `crd_`, `spr_`, `cmt_`, `tag_`, `doc_`, `rdm_`) +
   `key` legível (`CO-N`) gerado em transação atômica.

## Comandos do dia-a-dia

```bash
pnpm db:up        # Postgres (se reboot)
pnpm dev:api      # http://127.0.0.1:4400
pnpm dev:web      # http://127.0.0.1:4401
pnpm typecheck    # backend + web
pnpm db:generate  # gera SQL após mudar schema
pnpm db:migrate   # aplica
```

## Convenção de commits

1 commit por card/task, **só após o usuário confirmar** que funcionou. Mensagem
referencia a key (ex: `feat(docs): ... (CO-9)`).

## Após reiniciar Claude Code

O MCP `claude-organizer` carrega automaticamente (user scope). Postgres precisa
estar UP. Se uma tool MCP nova não aparecer, o processo subiu com versão antiga —
reinicie o Claude Code de novo.
