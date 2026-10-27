# RD-6 — Documentos e faturas

Data: 2026-10-27 · Programa de redesenho 2 · Depende da RD-0 · Estado: aprovado pelo fundador (autonomia total, 2026-10-26)

## Objetivo

Os documentos do projeto leem-se como uma grelha de ficheiros. O Figma apresenta-se como slides. O dinheiro segue a faixa de números do Início. Os PDFs comerciais seguem os templates da marca.

## Decisões

1. **Grelha de documentos:**
   - cada documento é um cartão com capa: um esboço de página com o ícone do tipo, um rótulo mono (PDF, FIG, FILE, URL) e o estado no canto;
   - por baixo ficam o título e "Tipo · Versão";
   - o cartão sobe ao pairar (`rd-lift`).
2. **Comercial:** apresentação, proposta, contrato e faturas numa lista com divisórias dentro de um só painel, com o estado à direita.
3. **Figma:**
   - os links de protótipo (`/proto/`) abrem com `scaling=contain`, `content-scaling=fixed` e `hotspot-hints=0`, para cada frame caber no ecrã como um slide;
   - o formulário de novo documento avisa quando o link é de ficheiro (`/design/`, `/file/`, `/board/`), que abre a tela inteira, e explica como copiar o link do protótipo.
4. **Dinheiro:** recebido, em aberto e gasto numa faixa única com divisórias e números de 28 px. No portal, o valor da fatura passa ao mesmo tamanho e os dados bancários ficam num bloco delimitado.
5. **PDFs da marca:**
   - o escritor partilhado ganha:
     - `eyebrow`: mono espaçado em Aurion Gold, maiúsculas;
     - `title`: serifado;
     - `rule`: filete;
   - o texto passa a Ink;
   - o pedido de pagamento e o contrato usam-nos;
   - o manual do Brand Hub continua com a identidade do cliente.
   - Fontes: as padrão do PDF (Times, Courier, Helvetica), sem dependências novas.

## Fora de âmbito

- **Editor de fatura com pré-visualização ao vivo.** Os pedidos de pagamento nascem dos marcos do contrato e das mensalidades e não têm linhas editáveis.
  - Revisitar quando houver faturação avulsa com linhas.
- **Miniaturas reais de PDF na grelha.** Exigem renderização no servidor.
  - Revisitar se o volume de documentos o justificar.

## Testes

- Unitários:
  - parâmetros do embed de protótipo;
  - deteção de links de tela;
  - aviso no formulário;
  - eyebrow em Courier e título em Times no PDF.
- Os testes existentes de cartões, fatura e PDFs continuam válidos.

## Critérios de conclusão

- Grelha, comercial, dinheiro e PDFs revistos nos dois temas.
- `STATUS.md` atualizado.
