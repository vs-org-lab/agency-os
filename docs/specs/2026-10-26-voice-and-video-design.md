# UX-5 — Testemunho em vídeo e notas de voz do cliente

Data: 2026-10-26 · Programa de redesenho da UI e UX · Depende da UX-3 · Estado: aprovado (autorização do fundador para o programa completo, 2026-10-26)

## Objetivo

1. O decisor do cliente grava o testemunho em vídeo no portal, com as perguntas a aparecer uma a uma por cima da câmara, como na referência `Screenshot 2026-10-21 003440`; o texto continua possível ("Escrever em vez disso").
2. Qualquer membro do cliente deixa uma **nota de voz** onde hoje escreve feedback (comentário numa prova, pedido de alterações numa aprovação), e a equipa recebe o áudio e a transcrição.

## Decisões

### Testemunho em vídeo

- Página atual `/portal/testimonial/[projectId]` passa a ter dois modos: **Vídeo** (padrão) e **Escrever** (formulário atual).
- **Gravador** (`step-player` + `dynamic-island` + `time-scrubber`, implementações próprias): pré-visualização da câmara (`getUserMedia`), seletores de câmara e microfone (`enumerateDevices`) com medidor de nível, perguntas em sobreposição ("1 de 5 · Tema", "Seguinte"), uma pílula de estado (`DynamicIsland`) com "A gravar · 01:23" e "Pausar/Parar"; limite de 5 minutos; depois de parar, pré-visualização com barra de tempo (`TimeScrubber`, teclado ±5 s) e "Gravar de novo" ou "Enviar".
- **Perguntas**: 5 perguntas fixas em pt-PT e en (mensagens i18n): situação antes, o que mudou, como foi trabalhar com o estúdio, resultado, a quem recomendaria. O índice da pergunta e o tempo em que começou ficam guardados (`chapters` jsonb: `[{ index, startedAtMs }]`) para a equipa saltar entre respostas.
- **Envio**: `MediaRecorder` (`video/webm` ou `video/mp4` conforme o navegador), máximo 200 MB; o servidor cria a linha e devolve um URL assinado de upload no bucket privado `testimonial-videos` (mesmo padrão de `core_recordings`: caminho `org/client/project/id.ext`); o cliente confirma o upload; a equipa vê o vídeo com URL assinado curto no separador do projeto, com os capítulos.
- **Consentimento**: caixa obrigatória "Autorizo a gravação e o uso interno"; "Autorizo publicar" continua separado (`consent_publish`).
- **Sem câmara** ou permissão negada: mensagem clara e passa a "Escrever".
- Esquema: `testimonials` ganha `video_path` (nullable), `video_content_type`, `video_duration_seconds`, `chapters` (jsonb), `video_status` (`pending` | `ready`); `body` passa a poder ser vazio quando há vídeo (check: `body` entre 1 e 1000 **ou** vídeo `ready`).

### Notas de voz

- Tabela `voice_notes`: `id`, `organization_id`, `client_id`, `project_id`, `target_kind` (`proof_comment` | `approval_change_request`), `target_id`, `author_id`, `path`, `content_type`, `duration_seconds` (1–180), `status` (`pending` | `uploaded` | `transcribed` | `failed`), `transcript` (texto), `created_at`.
- **Gravador de voz** (`voice-note` do bencho, implementação própria `VoiceNoteRecorder`): botão de microfone ao lado do campo de texto; gravar mostra onda simples e tempo (máx. 3 min); parar dá pré-visualização com `TimeScrubber`, "Apagar" ou "Enviar". Envia com upload assinado ao bucket privado `voice-notes`.
- **Transcrição**: evento `voice_note.uploaded` → função Inngest que usa o fornecedor de transcrição existente (`TRANSCRIPTION_PROVIDER`, `fake` no CI) e grava `transcript` e `status`.
- **Equipa**: no fio da prova e na aprovação, a nota aparece como leitor de áudio compacto com a transcrição por baixo ("A transcrever…" enquanto não chega).
- **Cliente**: vê as suas notas com o leitor.

## Segurança (08)

- Buckets privados; caminhos com org/cliente/projeto; URLs assinados de upload de uso único e de leitura com validade curta; tipos de conteúdo em lista fechada (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`; `video/webm`, `video/mp4`); tamanhos máximos verificados no confirmar (metadados do objeto).
- RLS: `voice_notes` com `force row level security`, leitura para membros do cliente com acesso ao projeto e para a equipa com acesso ao projeto; escrita só por serviço (`withActor` + contexto de sistema). Testemunhos mantêm as regras atuais.
- Um cliente nunca lê notas de outro cliente; testes de RLS provam-no.

## Fora de âmbito

- Edição do vídeo, legendas, publicação automática no site.

## Testes

- DB: criar/confirmar nota (tipo, tamanho, autor), transcrição grava texto, RLS entre clientes; testemunho com vídeo sem texto aceite, sem nada recusado.
- Componentes: gravadores com `MediaRecorder`/`getUserMedia` simulados (estados, limites, permissão negada → modo texto), `TimeScrubber` (teclado e `aria-valuenow`), `DynamicIsland` (estados).
- E2E: o cliente grava uma nota de voz numa prova com o microfone falso do Chromium (`--use-fake-device-for-media-stream`), a equipa vê a transcrição falsa; o testemunho por vídeo envia com a câmara falsa.

## Critérios de conclusão

- Vídeo e notas de voz em funcionamento em dev, `STATUS.md` e `INVENTORY.md` atualizados.
