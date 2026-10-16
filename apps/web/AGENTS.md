# XTOC Website Agent Rules

## Repository role

This is the public XTOC website and product-information repository. It is not the browser-extension source repository and must not become a private product-planning repository.

- Website work belongs here: public pages, current public documentation, website assets, and website maintenance.
- Extension behavior belongs in the XTOC extension repository. This site may describe only capabilities that are present in the released extension.
- Keep the repository documentation set small. `README.md` is an entry point, not a product requirements document. Do not create `docs/` unless a current, public maintenance need requires it.

## Public and private boundary

Repository documentation is allowed only when it is necessary to build, test, maintain, or use the current code; safe to publish in full; and describes current implementation rather than plans.

Keep product exploration, roadmaps, business strategy, competitor research, internal operations, unreleased plans, prompts or agent collaboration records, and private infrastructure details out of this repository. Store such material in the designated private Obsidian project area through `obsidian-cli`. If that path or tool is unavailable, report the blockage; do not use the repository as a fallback.

Never add secrets, tokens, webhook secrets, real credentials, private endpoints, or sensitive operational details. When public suitability is uncertain, leave the material out and ask for a decision in the completion report.

## Public claims

- Check product copy against the released XTOC README, release, and current shipped implementation.
- Do not present planned, experimental, typed-only, or private integrations as released features.
- Keep privacy statements narrow and verifiable. Distinguish saved clip data from broader claims about all browser or website data.
- Preserve the boundary between the website and extension repositories, and keep source and store links current.

## Development and verification

Use the scripts declared in `package.json`:

```bash
npm run dev
npm run lint
npm run build
```

For user-facing changes, validate the main pages in a browser at common mobile and desktop viewports. Check navigation and external links, keyboard access and visible focus, semantic labels and heading structure, readable contrast, responsive layout, and horizontal overflow. Confirm the final visuals are intentional and consistent rather than relying only on a successful build.

## Completion report

Report:

- files changed and why;
- lint, build, and browser checks performed, including any limitations;
- the released-extension sources used to verify public claims;
- public/private and secret-safety review results; and
- unresolved questions or follow-up work.

Do not commit, push, publish, or deploy unless the user explicitly requests it.
