# Sub-projeto 1B.1 — Gravação e transcrição da call Core — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` ou `superpowers:executing-plans` para executar este plano tarefa a tarefa. Os passos usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** gravar a call Core no modo call e guardar no Core uma transcrição com "Aurion" e "Cliente", feita na Groq sem custo.

**Arquitetura:** tabela `core_recordings` e bucket privado `core-recordings`; o browser envia as faixas por link assinado; uma porta `TranscriptionPort` (Groq e falso) transcreve; uma função pura junta as faixas; uma automação Inngest transcreve, acrescenta ao Core e apaga o áudio. Com o fornecedor falso (previews e testes) a transcrição corre no próprio pedido de confirmação, porque as previews não têm a app Inngest sincronizada.

**Stack:** a do 1B; `MediaRecorder`, `getDisplayMedia`, IndexedDB no browser; API REST da Groq (`/openai/v1/audio/transcriptions`) por `fetch`.

**Spec:** [docs/superpowers/specs/2026-10-08-core-transcription-design.md](../specs/2026-10-08-core-transcription-design.md)

## Restrições globais

- As do [plano do 1B](2026-10-08-core.md). Um ramo `feat/core-transcription` e um PR no fim.
- Valores do spec: Opus a 24 kbps (`audioBitsPerSecond: 24000`); paragem automática às 2 h; pedaços de 10 s em IndexedDB; ficheiros até 25 MB (26 214 400 bytes); tipos `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-m4a`; link de envio válido 2 h; 5 repetições; apagamento ao fim de 7 dias; modelo `whisper-large-v3`, `response_format=verbose_json`, idioma `pt` ou `en`.
- Variáveis: `TRANSCRIPTION_PROVIDER` (`groq` | `fake`, defeito `fake`), `GROQ_API_KEY` (obrigatória com `groq`).
- Evento novo `core.recording.uploaded`; ações de auditoria `core.recording.created`, `core.recording.transcribed`.

## Foco de revisão

1. **Captura sem áudio do separador** (o fundador não marcou "partilhar áudio"): o OS avisa e não grava só o microfone em silêncio. Teste na Task 6 (`refuses a capture without tab audio`).
2. **Confirmação de envio sem ficheiro no bucket** (envio falhou a meio): a gravação fica `pending_upload` e não emite evento. Teste na Task 3 (`confirm without the uploaded file keeps the recording pending`).
3. **Transcrição repetida depois de sucesso** (evento reenviado): não duplica o texto no Core. Teste na Task 4 (`transcribing a done recording does nothing`).
4. **Utilizador de outro cliente ou do portal**: não cria, não confirma e não lê gravações. Teste na Task 1 (`client users never read recordings`).
5. **Faixa sem fala** (silêncio, segmentos vazios): a junção não cria parágrafos vazios e a transcrição continua válida. Teste na Task 2 (`skips empty segments`).

---

### Task 1: Esquema e acesso das gravações

**Ficheiros:** `packages/db/src/schema/{enums,diagnosis}.ts`, migração gerada `<ts>_core_recordings.sql` com acesso e bucket, `packages/db/test/rls/core.test.ts` (+), `isolation.test.ts` (+), `fixtures.ts` (+ gravação no `createCoreFixture`).

- Enums `app.recording_source` (`call`, `upload`), `app.recording_status` (`pending_upload`, `uploaded`, `transcribing`, `done`, `failed`).
- `core_recordings` com os campos da secção 4 do spec; `consent_by` e `consent_at` obrigatórios; RLS por `can_read_pipeline` / `can_write_pipeline`; nenhum acesso do portal.
- Bucket `core-recordings` (25 MB, tipos de áudio) criado só onde existe `storage.buckets`.
- [ ] Testes `staff reads recordings by pipeline access`, `client users never read recordings` → FALHA → esquema e migração (dry-run e aplicação ao dev) → PASSA → commit `feat(db): add Core call recordings`.

### Task 2: Junção das faixas

**Ficheiros:** `apps/web/src/modules/diagnosis/transcription/merge.ts` (+ teste).

- `type TranscriptSegment = { start: number; end: number; text: string }`.
- `mergeTracks(tracks: Array<{ speaker: string | null; segments: TranscriptSegment[] }>): string` — ordena por `start`; junta segmentos seguidos do mesmo orador; `[mm:ss] Orador: texto` por parágrafo (`[mm:ss] texto` sem orador); ignora segmentos vazios.
- `transcriptSection(header: string, body: string): string`.
- [ ] Testes `interleaves both tracks by time`, `merges consecutive segments of the same speaker`, `skips empty segments`, `formats hours past sixty minutes as mm` → FALHA → implementar → PASSA → commit.

### Task 3: Porta de transcrição e serviço de gravações

**Ficheiros:** `diagnosis/transcription/{port,groq,fake,storage}.ts`, `diagnosis/recordings.ts`, `platform/env.ts` (+ `transcriptionEnv`), testes `groq.test.ts`, `recordings.db.test.ts`.

- `TranscriptionPort.transcribe({ bytes, fileName, contentType, language }): Promise<TranscriptSegment[]>`; `createGroqTranscription({ apiKey, fetch? })` (multipart, `whisper-large-v3`, `verbose_json`, idioma; 413 → `file_too_large`, 429 → `rate_limited`, outros → `provider_error`); `createFakeTranscription()`.
- `RecordingStorage { createUploadUrl(path): Promise<string>; exists(path): Promise<boolean>; download(path): Promise<Uint8Array>; remove(paths: string[]): Promise<void> }` com adaptador Supabase e de memória.
- `createRecording(claims, { engagementId, source, consent: true, extension }, deps)` → `{ recordingId, uploads: Array<{ track: 'client' | 'studio'; url: string }> }`; `confirmRecordingUpload(claims, { recordingId }, deps)` → `uploaded` e evento (ou `pending_upload` se faltar ficheiro); `retryRecording(claims, { recordingId }, deps)`.
- [ ] Testes Groq (sucesso, 413, 429, 503) e base de dados (`consent is required`, `creates upload links for both call tracks`, `confirm without the uploaded file keeps the recording pending`, `manager of another client gets not_found`) → FALHA → implementar → PASSA → commit.

### Task 4: Transcrição e limpeza

**Ficheiros:** `diagnosis/transcribe.ts` (+ `transcribe.db.test.ts`), `commercial/automations.ts` (funções `core-recording-transcribe` e `core-recording-sweep`), `diagnosis/server.ts`.

- `transcribeRecording(recordingId, deps: { contexts; storage; transcription; now }): Promise<'done' | 'skipped'>` — `uploaded`/`failed` → `transcribing`; transcreve cada faixa no idioma do lead; `mergeTracks`; acrescenta à transcrição com `transcriptSection`; apaga ficheiros; `done`.
- `markRecordingFailed(recordingId, error)`; `sweepExpiredRecordings(now)` apaga ficheiros de gravações não `done` com mais de 7 dias.
- Com `TRANSCRIPTION_PROVIDER=fake`, `confirmRecordingUpload` chama `transcribeRecording` no próprio pedido.
- [ ] Testes `appends the merged transcript and deletes the audio`, `transcribing a done recording does nothing`, `keeps the existing transcript`, `sweep removes audio older than seven days` → FALHA → implementar → PASSA → commit.

### Task 5: Ações de servidor

**Ficheiros:** `pipeline/[dealId]/core/recording-actions.ts`.

- `startRecordingAction(engagementId, input: { source; consent; extension })`, `confirmRecordingAction(recordingId, dealId)`, `retryRecordingAction(recordingId, dealId)`, cada uma com `commercialSession`.
- Coberto pelos testes das Tasks 3, 4 e 6.

### Task 6: Gravação no modo call

**Ficheiros:** `core/call/recorder.ts` (captura, `MediaRecorder`, IndexedDB), `core/call/recording-panel.tsx` (+ teste), `call-mode.tsx`, `core-tab.tsx` (estado), mensagens `diagnosis.recording.*`.

- Painel: consentimento obrigatório, "Gravar a call", tempo decorrido, "Parar", "Enviar gravação interrompida", "Carregar ficheiro de áudio" (até 25 MB), estados (a enviar, a transcrever, pronta, falhou com "Tentar de novo").
- `startCapture()` recusa uma captura sem faixa de áudio do separador.
- [ ] Testes `recording needs the client consent`, `refuses a capture without tab audio`, `refuses an audio file above 25 MB` → FALHA → implementar → PASSA → commit.

### Task 7: Ponta a ponta, staging e documentação

**Ficheiros:** `e2e/core.spec.ts` (+), workflows (`TRANSCRIPTION_PROVIDER` e `GROQ_API_KEY`), `.env.example`, `docs/STATUS.md`, `docs/product/08` (subcontratante), registo de execução.

- [ ] E2E `uploaded audio becomes the Core transcript` (fornecedor falso) e axe do modo call; staging com `TRANSCRIPTION_PROVIDER=groq` quando existe `STAGING_GROQ_API_KEY`.
- [ ] Revisão final, PR, staging, teste real do fundador (1B e 1B.1).
