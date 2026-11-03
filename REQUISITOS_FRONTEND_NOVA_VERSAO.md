# Requisitos — Front-end da nova versão

## 1. Objetivo

Construir uma interface web clara para uma atividade prática de RSA. Em cada atividade criada pelo professor, dois grupos trabalham de forma complementar:

- o **grupo codificador** envia um projeto em C que recebe uma mensagem e produz o conteúdo cifrado;
- o **grupo decodificador** envia um projeto em C que recebe o conteúdo cifrado e recupera a mensagem.

O front-end é responsável por orientar o usuário, receber os arquivos `.zip`, mostrar o andamento das validações e apresentar resultados e feedbacks sem expor detalhes internos do servidor.

## 2. Tecnologia recomendada

- **React + TypeScript**, criado com Vite.
- Biblioteca de interface: **Material UI** ou **shadcn/ui**; escolher uma e manter o design consistente.
- React Router para navegação.
- TanStack Query para chamadas à API, cache e estados de carregamento/erro.
- React Hook Form + Zod para formulários e validações no navegador.

React é uma boa escolha neste caso: separa a experiência do usuário do backend Python, facilita telas distintas para professor/aluno e integra diretamente com a API FastAPI. Em produção, o build estático pode ser servido por Nginx/CDN, enquanto FastAPI atende somente a API; em desenvolvimento, o Vite executa seu servidor próprio.

## 3. Perfis e permissões visíveis

| Perfil | Ações no front-end |
| --- | --- |
| Professor | Criar e publicar atividades, criar grupos, definir qual grupo codifica/decodifica, acompanhar entregas, iniciar testes, visualizar resultados, reabrir ou encerrar atividade. |
| Aluno | Entrar em grupo, consultar instruções, enviar/reenviar o `.zip` do seu papel, acompanhar processamento e ver o resultado/feedback permitido. |
| Administrador (opcional) | Gerenciar usuários, turmas, disciplinas e limites globais. |

O front-end não substitui a autorização da API: botões e rotas devem ser escondidos/convenientes conforme o perfil, mas o backend deve validar cada permissão.

## 4. Telas

### 4.1. Páginas comuns

- **Login e recuperação de senha**.
- **Painel inicial** com atividades ativas, pendências e últimos resultados.
- **Perfil** com nome, matrícula/e-mail, turma e grupo atual.
- Página de erro `403`, página não encontrada e estado de indisponibilidade da API.

### 4.2. Área do professor

1. **Lista de atividades**
   - filtros por turma, status e prazo;
   - indicadores de grupos configurados, envios recebidos e testes concluídos;
   - ação para criar, editar, publicar, fechar ou arquivar.
2. **Criação/edição de atividade**
   - título, descrição, turma, prazo e status;
   - instruções de RSA e link para o contrato dos programas C;
   - limites de arquivo, tempo e memória exibidos aos alunos;
   - casos de teste visíveis e/ou privados;
   - opção para permitir reenvio até o prazo e para controlar a visibilidade do feedback.
3. **Gestão de grupos**
   - criação manual, importação de lista e alocação de alunos;
   - seleção explícita de um grupo como `codificador` e outro como `decodificador` para cada desafio;
   - avisos para grupos incompletos ou papéis duplicados.
4. **Detalhe da atividade**
   - linha do tempo por grupo: enviado, validado, compilado, testado, aprovado/reprovado;
   - download do artefato entregue somente para o professor;
   - painel de resultados com logs de compilação, resultados por caso e mensagem de erro sanitizada;
   - comando para executar/reexecutar a bateria de testes.

### 4.3. Área do aluno

1. **Detalhe da atividade**
   - papel do grupo em destaque: `Codificar` ou `Decodificar`;
   - instruções, prazo, contrato de entrada/saída e exemplo mínimo;
   - estado da entrega (não enviada, em processamento, válida, inválida, expirada);
   - feedback liberado pelo professor.
2. **Envio de projeto**
   - área de arrastar e soltar e seletor de arquivo, aceitando apenas `.zip`;
   - validações antecipadas de extensão e tamanho;
   - lista do conteúdo detectado no `.zip` e aviso se falta o arquivo obrigatório;
   - barra de progresso de upload e acompanhamento por polling ou WebSocket após o envio;
   - confirmação clara de versão enviada, data/hora e opção de reenviar quando permitido.
3. **Resultado integrado**
   - exibir se o codificador e o decodificador funcionaram em conjunto;
   - destacar o resumo da bateria, por exemplo **`222 de 240 testes aprovados (92,5%)`**, com barra de progresso e contador de casos com falha/erro;
   - exibir oito subtotais de **30 testes**: primos de 2, 3, 4, 5, 6, 7, 8 e 9 dígitos. Exemplo: `2 dígitos: 30/30` e `9 dígitos: 22/30`;
   - mostrar a lista de testes públicos com identificador, status, duração e diagnóstico permitido;
   - mostrar testes privados somente como quantidade e status, sem revelar mensagem, chave, ciphertext ou saída esperada;
   - mostrar erro de compilação ou de execução de forma legível; logs completos dependem da política do professor.
4. **Teste personalizado**
   - disponibilizar, para o dono de cada ZIP, campos para os primos `p` e `q`, expoente `e` e mensagem;
   - orientar os limites aplicados pela API: primos entre 2 e 9 dígitos e mensagem ASCII imprimível de até 1.000 caracteres, sem aspas duplas ou barra invertida;
   - exibir o status, `n`, `e`, ciphertext e texto decifrado retornados pela API, deixando claro que o resultado não substitui a bateria oficial.

## 5. Fluxo principal

```text
Professor cria atividade e define grupos/papéis
        ↓
Aluno envia .zip do seu grupo
        ↓
UI mostra: arquivo recebido → validando → compilando → testando
        ↓
API devolve resultado da entrega e, quando ambos existem,
executa vários testes: codificador → decodificador → comparação
        ↓
Professor e alunos visualizam o feedback permitido
```

## 6. Requisitos de UX e acessibilidade

- Interface responsiva para desktop e celular; o fluxo de upload deve funcionar em ambos.
- Linguagem em português brasileiro, mensagens objetivas e sem termos técnicos desnecessários.
- Nunca apagar silenciosamente a versão anterior: um reenvio cria uma nova versão e a tela mostra qual está ativa.
- Estados de carregamento, vazio, sucesso e falha em toda ação assíncrona.
- Erros de compilação devem preservar quebras de linha e destacar arquivo/linha quando disponíveis.
- Navegação por teclado, foco visível, rótulos em todos os campos, contraste mínimo WCAG AA e mensagens acessíveis a leitores de tela.
- Não exibir a mensagem original de casos privados, credenciais, caminhos do servidor ou logs sensíveis.

## 7. Integração com a API

O front-end deve consumir uma API versionada, por exemplo `/api/v1`. Para o upload, usar `multipart/form-data`; para consultas e ações administrativas, JSON. Formatos detalhados e códigos de erro são definidos em `REQUISITOS_BACKEND_NOVA_VERSAO.md`.

Principais recursos esperados:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`;
- `GET|POST /activities`, `GET|PATCH /activities/{id}`;
- `GET|POST /activities/{id}/groups`;
- `POST /activities/{id}/submissions`;
- `GET /submissions/{id}` e `GET /submissions/{id}/logs`;
- `POST /activities/{id}/runs` e `GET /runs/{id}`.
- `GET|POST /rsa-uploads`, `POST /rsa-uploads/{id}/test` e `POST /rsa-uploads/{id}/custom-test`.

## 8. Critérios de aceite do front-end

- Um aluno consegue identificar seu papel e enviar um `.zip` em até uma tela.
- O envio mostra estado de processamento até resultado final, sem recarregar a página.
- Após a execução, o aluno visualiza de imediato o total de 240 testes, quantos aprovou, sua percentagem e os subtotais das oito faixas de primos, respeitando a política de casos privados.
- O professor identifica quais dos dois grupos estão pendentes e se a integração passou.
- Uma pessoa sem permissão não consegue acessar ações de outra turma/grupo pela interface nem pela API.
- A aplicação é utilizável em largura de 360 px e em desktop.
