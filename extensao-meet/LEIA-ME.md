# Extensão: atendimento ao lado do Meet

Quando o profissional abre o Google Meet de uma consulta, a extensão abre o painel de atendimento
do paciente (`/atendimento/<consulta>`) numa janela ao lado, na metade direita da tela.

## Como funciona
1. A extensão lê só o **endereço** da aba do Meet (o código `abc-defg-hij`).
2. Pergunta ao sistema (`/api/atendimento/resolver`), com o login do profissional, qual consulta dele usa esse link.
3. Se achar, abre o painel. Se não achar, mostra "?" no ícone. Sem login, mostra "!" e o clique no ícone abre a tela de entrada.

Para funcionar, o link do Meet precisa estar **na consulta** (campo "Link da videochamada" ao agendar ou na tela da consulta).

## Instalação (Chrome ou Edge)
1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta (`extensao-meet`).
3. Na tela de opções que abrir, informe o endereço do sistema (ex.: `https://sistema.suaclinica.com.br`) e salve. O navegador pede permissão só para esse endereço.
4. Entre no sistema normalmente como profissional e abra o Meet de uma consulta.

Para distribuir às clínicas sem o modo do desenvolvedor, publique como extensão **não listada** na Chrome Web Store.

## Privacidade
- Permissões: o endereço do Meet (`meet.google.com`), o endereço do sistema que você informa, o tamanho da tela (para dividir a janela) e o armazenamento das opções.
- Não lê vídeo, áudio, chat nem o conteúdo da página do Meet.
- O painel é uma página do próprio sistema, com o mesmo login e a mesma proteção.
