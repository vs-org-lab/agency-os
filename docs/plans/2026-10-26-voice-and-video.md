# UX-5 Testemunho em vídeo e notas de voz — Plano de implementação

**Spec:** `docs/specs/2026-10-26-voice-and-video-design.md`

## Global Constraints

- Migrações: esquema Drizzle + `generate`; RLS, grants, buckets e políticas de storage em `generate:custom` (seguir `20261008130307_core_recordings*.sql`). Aplicar a dev só com o esquema final e **nunca com um job e2e do CI a correr** (`gh run list --status in_progress`).
- Reutilizar `deps.storage.createUploadUrl`, o fornecedor de transcrição do Core e o padrão de eventos/Inngest existente. Sem dependências novas.
- Nunca `e2e:seed` nem e2e locais.

### Task 1: Esquema e migrações

`voice_notes` + colunas de vídeo em `testimonials` + buckets `voice-notes` e `testimonial-videos` + RLS/políticas; DB tests de RLS. Commit `feat(db): voice notes and testimonial videos`.

### Task 2: Serviços de notas de voz

`apps/web/src/modules/voice-notes/` (`createVoiceNote`, `confirmVoiceNote`, `listVoiceNotes(target)`, transcrição Inngest). DB tests. Commit `feat(web): client voice notes with transcription`.

### Task 3: Serviços do testemunho em vídeo

`modules/testimonials` (`startTestimonialVideo`, `confirmTestimonialVideo`, leitura com URL assinado e capítulos para a equipa). DB tests. Commit `feat(web): video testimonials`.

### Task 4: Componentes

`packages/ui`: `TimeScrubber`, `DynamicIsland`; `apps/web/src/components/media/`: `VoiceNoteRecorder`, `VoiceNotePlayer`, `TestimonialRecorder` (step-player). Tests com media simulada. Commit `feat(ui): recorders, scrubber and status island`.

### Task 5: Integração nos ecrãs

Prova (comentário do cliente e fio da equipa), aprovação (pedido de alterações), página do testemunho (modos Vídeo/Escrever), separador do testemunho na equipa. Mensagens pt-PT e en. Commit `feat(web): voice notes and video testimonial in the portal`.

### Task 6: E2E, documentação e verificação

`e2e/voice-notes.spec.ts` e passo de vídeo no e2e do testemunho com `--use-fake-device-for-media-stream`/`--use-fake-ui-for-media-stream` (o `playwright.config.ts` já usa estes argumentos no Core? confirmar e reutilizar). `STATUS.md`, `INVENTORY.md`. `pnpm typecheck && pnpm lint && pnpm test`, prettier, build. Commit `docs: voice notes and video testimonial in status and inventory`.
