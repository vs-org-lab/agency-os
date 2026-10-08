# Sub-projeto 1B.1 — Gravação e transcrição da call Core

| Campo                   | Valor                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- |
| Data                    | 2026-10-08                                                                      |
| Estado                  | Aprovado                                                                        |
| Vaga                    | 1 (complemento do 1B, antes do teste real do Core)                              |
| Módulos                 | M03 Diagnóstico e estratégia (Aurion Core)                                      |
| Documentação de produto | `docs/product/01` (RF-022, transcrição da call), `08` (SEC-30, subcontratantes) |
| Depende de              | [Sub-projeto 1B — Diagnóstico Aurion Core](2026-10-08-core-design.md)           |

## 1. Objetivo

Gravar a call Core a partir do modo call e transformá-la, sem custo, numa transcrição com quem falou ("Aurion" e "Cliente"), guardada no Core e pronta para o assistente montar o briefing. O Google Meet numa conta Gmail pessoal não grava nem transcreve; o OS faz isso com a Groq (Whisper large-v3), gratuita até 8 horas de áudio por dia.

## 2. Âmbito

### Incluído

1. Gravação no modo call, no Chrome e no Edge de computador, com duas faixas: o áudio do separador do Meet (cliente) e o microfone (Aurion).
2. Confirmação "O cliente autorizou a gravação" antes de gravar, guardada com autor e data.
3. Recuperação de uma gravação interrompida (página fechada ou recarregada) a partir do armazenamento local do browser.
4. Alternativa: carregar um ficheiro de áudio até 25 MB, numa só faixa.
5. Envio direto do browser para um bucket privado, por link de envio assinado.
6. Transcrição na Groq, no idioma do lead, faixa a faixa; junção por tempo com etiquetas; acrescento ao campo Transcrição do Core.
7. Apagamento do áudio depois da transcrição; repetição automática; alerta ao fundador quando falha; apagamento ao fim de 7 dias de um áudio que nunca foi transcrito.
8. Estado visível no modo call e no separador Core.

### Excluído (registado em `docs/STATUS.md`)

| Item                                                     | Motivo                                                                      | Volta quando                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| Gravação noutros browsers ou no telemóvel                | A captura do áudio de um separador só existe no Chrome e Edge de computador | Pedido real de outro dispositivo |
| Transcrição em tempo real durante a call                 | O briefing é escrito durante a call; a transcrição serve depois             | Avaliação depois do lançamento   |
| Separação de vozes num ficheiro carregado à mão          | Exige um serviço pago de diarização                                         | Volume que o justifique          |
| Revisão do DPA da Groq e ativação de Zero Data Retention | Subcontratante novo                                                         | Critérios de lançamento          |

## 3. Fluxo

1. No modo call, o fundador marca "O cliente autorizou a gravação" e carrega em "Gravar a call".
2. O browser pede o separador a partilhar; o fundador escolhe o separador do Meet com "partilhar áudio do separador". O OS pede também o microfone.
3. Duas gravações `MediaRecorder` em paralelo, áudio Opus a 24 kbps; os pedaços são guardados de 10 em 10 segundos no armazenamento local do browser (IndexedDB). A gravação pára sozinha às 2 horas (no máximo cerca de 22 MB por faixa).
4. "Parar" fecha as duas faixas; o OS cria o registo da gravação, pede dois links de envio assinados e envia cada faixa diretamente para o bucket `core-recordings`. Concluído o envio, o OS confirma-o e emite `core.recording.uploaded`; o armazenamento local é limpo.
5. Se a página foi fechada a meio, ao voltar ao modo call do mesmo negócio aparece "Enviar gravação interrompida", que segue o passo 4 com os pedaços guardados.
6. A automação `core-recording-transcribe` (5 repetições) transcreve cada faixa na Groq (`whisper-large-v3`, `verbose_json`, idioma `pt` ou `en` conforme o lead), junta os segmentos por tempo, acrescenta o texto à transcrição do Core com um separador datado e apaga os ficheiros.
7. Se todas as repetições falham, a gravação fica `failed`, o fundador recebe o alerta de automação e o modo call mostra "Falhou · tentar de novo", que volta a emitir o evento. O varrimento diário apaga os ficheiros de gravações não transcritas com mais de 7 dias.

## 4. Dados e acesso

| Tabela            | Campos principais                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core_recordings` | organização, cliente, Core, origem (`call`, `upload`), estado (`pending_upload`, `uploaded`, `transcribing`, `done`, `failed`), caminho da faixa do cliente, caminho da faixa da Aurion (só `call`), idioma, consentimento (por, em), erro, criado em, transcrito em |

- RLS forçado e privilégios por coluna; leitura e escrita por `app.can_read_pipeline` / `app.can_write_pipeline`; nenhum acesso de utilizadores do cliente.
- Bucket privado `core-recordings`, 25 MB por ficheiro, tipos `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`, `audio/wav`, `audio/x-m4a`; sem políticas em `storage.objects` (envio só por link assinado criado pelo servidor; leitura só pelo servidor).
- Caminho `organização/cliente/core/gravação/faixa.extensão`.
- Variável nova `GROQ_API_KEY` (servidor), `TRANSCRIPTION_PROVIDER` (`groq` | `fake`, por defeito `fake`); previews e testes usam `fake`.

## 5. Junção das faixas

- Cada faixa devolve segmentos (`start`, `end`, `text`). Os segmentos das duas faixas são ordenados por `start`; segmentos seguidos da mesma faixa juntam-se num parágrafo.
- Formato: `Aurion: …` e `Cliente: …`, um parágrafo por troca, com a marca de tempo `[mm:ss]` no início de cada parágrafo.
- Um ficheiro carregado à mão não tem etiquetas: o texto segue com as marcas de tempo.
- O resultado é acrescentado à transcrição existente com o cabeçalho `— Gravação de <data e hora> —`; nunca substitui texto.

## 6. Erros e segurança

- Só quem pode escrever no pipeline do cliente cria gravações, pede links de envio ou repete transcrições.
- O link de envio assinado vale 2 horas e serve um único caminho; o servidor confirma que o ficheiro existe antes de emitir o evento.
- O áudio nunca chega ao portal nem a utilizadores do cliente; a transcrição continua interna (como no 1B).
- A chave da Groq só existe no servidor; o pedido inclui só o áudio, o modelo e o idioma.
- Sem dados pessoais nos registos de erro.
- O consentimento é obrigatório para gravar (a confirmação não é opcional no ecrã nem no serviço).

## 7. Testes

- **Unitários:** junção das faixas (ordem, parágrafos, etiquetas, marcas de tempo), adaptador Groq com respostas falsas (sucesso, 413, 429, 5xx), validação do tipo e do tamanho do ficheiro, cálculo do caminho.
- **Base de dados:** criação com consentimento obrigatório, autorização, transições de estado, acrescento à transcrição sem apagar, apagamento dos ficheiros, varrimento dos 7 dias, isolamento entre clientes.
- **Ponta a ponta:** carregar um áudio curto no modo call com o adaptador falso, ver "Transcrição pronta" e o texto no separador Core; o portal continua sem transcrição.

## 8. Critérios de aceitação

1. Uma call gravada no modo call (Chrome) chega à transcrição do Core com "Aurion:" e "Cliente:" intercalados por tempo.
2. Sem a confirmação de autorização não é possível gravar.
3. Uma gravação interrompida pode ser enviada ao voltar ao modo call.
4. Um ficheiro carregado até 25 MB é transcrito; acima disso é recusado antes do envio.
5. O áudio é apagado depois da transcrição; nada fica para além de 7 dias.
6. Uma falha persistente gera alerta e pode ser repetida a partir do ecrã.
7. Testes de ponta a ponta e axe passam em staging; o teste real do fundador (1B e 1B.1) passa.

## 9. Riscos

| Risco                                                   | Mitigação                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| O fundador esquece-se de partilhar o áudio do separador | O OS verifica que a captura tem faixa de áudio e avisa antes de começar                              |
| Plano gratuito da Groq muda ou esgota (8 h por dia)     | Porta `TranscriptionPort`; o plano pago custa cêntimos por call; trocar de fornecedor é um adaptador |
| Qualidade em português de Portugal                      | Whisper large-v3 com o idioma indicado; o texto é sempre rascunho editável                           |
| Áudio de um cliente nos EUA (RGPD)                      | Sem retenção por defeito; ZDR e DPA nos critérios de lançamento; áudio apagado no OS                 |
