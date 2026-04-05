# CLI Reference

## Usage

```bash
npx knowledge-explorer [options]
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| (none) | Full pipeline: collect + analyze + render | Full scan |
| `--collect-only` | Collect docs to cache only (no AI needed) | — |
| `--analyze-only` | Analyze cached docs (needs API key) | — |
| `--render-only` | Render cached results to terminal + Feishu doc | — |
| `--query <keyword>` | Keyword search mode (instead of full scan) | Full scan |
| `--owner me\|others\|<name>` | Filter by document owner | All |
| `--space <space_id>` | Limit to specific wiki space | All spaces |
| `--max-pages <n>` | Max search result pages | 10 |
| `--list-spaces` | List all accessible wiki spaces and exit | — |

## Environment Variables

Set in `.env` (auto-loaded) or shell:

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | AI API key (Path B only) | — |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint | `https://api.openai.com/v1` |
| `AI_MODEL` | Model name | `gpt-4o-mini` |

## Required Feishu Scopes

| Scope | Purpose |
|-------|---------|
| `search:docs_wiki:readonly` | Search documents |
| `wiki:node:read` | Read wiki nodes |
| `docx:document:readonly` | Read document content |
| `docx:document` | Create report document |
