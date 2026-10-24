# AcolheSus / VitalSync — Backend

API em Node.js + Express + PostgreSQL que substitui o `VitalSyncStore`
(localStorage, em `Public/js/store.js`) por um back-end de verdade,
usando exatamente as tabelas de `Database/criacaoTabela.sql`.

## Como rodar

```bash
cd Backend
npm install
cp .env.example .env      # ajuste DATABASE_URL e JWT_SECRET
npm run db:criar          # roda Database/criacaoTabela.sql
npm run db:seed           # roda Database/insertScript.sql (dados de exemplo)
npm run admin:criar -- "Seu Nome" voce@unidade.gov.br "senha-forte" 1   # 1º admin (último arg = id da unidade)
npm run dev                # sobe a API em http://localhost:3000
```

O cadastro de profissionais é **fechado**: `POST /api/auth/cadastro` exige token de
admin e cadastra sempre na unidade do próprio admin. O primeiro admin nasce pelo
comando `admin:criar` acima (ele também serve para resetar a senha de um admin).

**Sem back-end (modo local, padrão):** `Public/js/config.js` vem com `VITALSYNC_MODO = 'local'`. Nesse
modo o login de profissionais, o pedido de acesso e a aprovação funcionam só no navegador (localStorage),
sem Node nem PostgreSQL — basta abrir `Public/index.html`. Na primeira vez é criado o administrador de
demonstração `admin@vitalsync.local` / `admin1234` (aparece na tela de login). As contas ficam apenas
**naquele navegador/computador** e **não há segurança real** (é para demonstração). Para usar o
back-end, mude para `'api'` em `config.js`.

**Criar login na hora (com aprovação):** na tela de login o profissional clica em
*Criar login de profissional* (`solicitar.html`), escolhe unidade e função e define a senha.
A conta nasce com `status = 'pendente'` e **não consegue entrar** até um admin da mesma unidade
aprovar em `cadastro.html` (bloco *Solicitações de acesso*). Por aqui nunca se cria `admin`.
Em banco já existente, rode uma vez `npm run db:migrar` (quem já estava cadastrado continua ativo).

**Abrir o sistema:** com `npm run dev` rodando, acesse **http://localhost:3000/** — a API também serve
a pasta `Public/`, então não precisa de Live Server nem de CORS. Se preferir Live Server, ele funciona
em qualquer porta de `localhost`/`127.0.0.1` em desenvolvimento.

Requer um PostgreSQL rodando e acessível pela `DATABASE_URL` do `.env`.

**VitalSync Verde para o paciente:** `verde-paciente.html` (aba *VitalSync Verde* da área do paciente) é a
versão **somente leitura** de `verde.html`, sem exigir login de profissional. Mostra as condições de hoje
(umidade em destaque, temperatura, ar, UV, chuva, dengue), as **campanhas da equipe**, o mapa de alertas e
a prevenção. Dados ambientais, ícones e utilitários ficam em `js/verdeDados.js`, compartilhado com
`verde.html` (para integrar fontes oficiais, troque só `AmbientDataSource`). As campanhas são as
*Ações ambientais* que o profissional marca com **“Divulgar aos pacientes”** em `verde.html`; ações sem essa
marca continuam internas. Hoje ambas as telas leem `localStorage` (mesmo navegador); ao ligar o back-end,
troque `acoesPublicas()` em `js/verdePaciente.js` por um endpoint público só de leitura (pendência).

**Área do paciente:** `fila.html` (Fila de espera) e `historico.html` (Meu histórico) têm abas
no topo. O histórico lista todos os atendimentos do paciente identificado, com sintomas, receitas,
orientações/atestado e filtro por andamento. Hoje lê do `VitalSyncStore` (localStorage), igual à fila;
ao ligar o front à API, troque `meusAtendimentos()` em `js/historico.js` por um endpoint
protegido por sessão do paciente (ver pendência de segurança abaixo).

## Estrutura

```
Backend/
├── server.js                 # monta o Express e as rotas
├── src/
│   ├── db.js                 # pool de conexão com o PostgreSQL
│   ├── db/executarSql.js     # roda os .sql de Database/ (criação/seed)
│   ├── middleware/auth.js    # exige JWT de profissional autenticado
│   ├── utils/
│   │   ├── prioridade.js     # mesma regra de classificação de sintomas.js
│   │   ├── senha.js          # gera a senha (E001, U014, ...)
│   │   └── otp.js            # gera/hasheia/confere o código de 6 dígitos
│   ├── controllers/          # regra de negócio de cada recurso
│   └── routes/                # define os endpoints HTTP
```

## Endpoints

| Método | Rota                        | Quem usa (tela)          | Acesso |
|--------|-----------------------------|---------------------------|--------|
| GET    | `/api/unidades`             | paciente.html              | público |
| POST   | `/api/pacientes`            | paciente.html              | público, limitado (10/10 min por IP). Só **cria**; CPF já existente não é alterado e nada é devolvido além do `id` |
| GET    | `/api/pacientes/cpf/:cpf`   | paciente.html, entrar.html | público, limitado (10/10 min por IP). Devolve só `id` + telefone **mascarado** — sem nome, CPF ou e-mail |
| GET    | `/api/pacientes/:id`        | painel.html                | **profissional**, só paciente da própria unidade (senão 404) |
| POST   | `/api/otp/solicitar`        | entrar.html                | público, limitado (por IP e por paciente) |
| POST   | `/api/otp/verificar`        | entrar.html                | público, limitado (por IP e por paciente) |
| POST   | `/api/auth/cadastro`        | cadastro.html (só admin)   | **admin** |
| POST   | `/api/auth/solicitar-acesso`| solicitar.html             | público, limitado (5/h por IP). Cria conta **pendente**, nunca admin |
| GET    | `/api/auth/solicitacoes`    | cadastro.html              | **admin** — pendentes da própria unidade |
| PATCH  | `/api/auth/solicitacoes/:id`| cadastro.html              | **admin** — `{ "acao": "aprovar" \| "recusar" }` |
| POST   | `/api/auth/login`           | login.html                 | público, bloqueio após 5 falhas; pendente/recusado recebe 403 |
| GET    | `/api/auth/me`              | guard do front             | **profissional** |
| GET    | `/api/sintomas/catalogo`    | sintomas.html              | público |
| POST   | `/api/sintomas/avaliacoes`  | sintomas.html              | público, limitado (10/10 min por IP) |
| GET    | `/api/fila?unidade_id=`     | fila.html                  | público, limitado. **Sem nome nem id de paciente** |
| GET    | `/api/fila/:id/posicao`     | fila.html                  | público, limitado |
| GET    | `/api/fila/painel`          | painel.html                | **profissional** — fila da unidade do token, com nome |
| GET    | `/api/fila/:id`             | painel.html                | **profissional**, só da própria unidade (inclui CPF e dados clínicos) |
| PATCH  | `/api/fila/:id/status`      | painel.html                | **profissional**, só da própria unidade |

Rotas marcadas como **sim** exigem o header:

```
Authorization: Bearer <token retornado por /api/auth/login>
```

## O que muda no front-end (`Public/`)

Hoje `Public/js/store.js` guarda tudo em `localStorage`. Para ligar ao
back-end, troque cada função do `VitalSyncStore` por um `fetch()`
correspondente, mantendo a mesma assinatura usada pelas outras telas
(`cadastro.js`, `entrar.js`, `sintomas.js`, `fila.js`, `painel.js`),
por exemplo:

```js
// antes (store.js): savePaciente(dados) gravava no localStorage
// depois:
async function savePaciente(dados) {
  const resp = await fetch('http://localhost:3000/api/pacientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  return resp.json();
}
```

Como as regras de negócio (classificação de prioridade, geração de
senha, transições de status) já vivem no `Backend/src/utils` e nos
controllers, o front-end passa a só exibir o que a API responde — o
comentário que já existia em `store.js` ("isso pode ser substituído
por chamadas fetch() mantendo a mesma assinatura") é exatamente esse
passo.

## Segurança (pontos que valem revisão antes de produção)

- Senhas de profissionais usam `bcryptjs`; nunca fica texto puro no banco.
- Código OTP também é guardado só como hash, com expiração e limite de tentativas.
- `JWT_SECRET` deve ser um valor forte e mantido fora do controle de versão (`.env` não deve ir para o Git).
- O login bloqueia 5 falhas seguidas por IP+e-mail por 15 min (em memória; com várias instâncias, use Redis/`express-rate-limit`).
- O front guarda o JWT em `sessionStorage` (ou `localStorage` com "Manter conectado"); o token expira em 8h. Cookie httpOnly seria mais robusto contra XSS.
- Rotas públicas têm limite de requisições em memória (`src/middleware/limitador.js`). Com várias instâncias ou atrás de proxy, troque por `express-rate-limit` + Redis e configure `app.set('trust proxy', ...)` para o IP real chegar certo.
- **XSS:** todo dado vindo de paciente/profissional que entra em `innerHTML` (`painel.js`, `fila.js`) passa por `escapeHtml()`; campos numéricos por `Number()`. Regra para código novo: dado de usuário → `textContent` ou `escapeHtml()`, nunca direto no template.
- Pendente (fora deste escopo): o paciente ainda não tem sessão própria. O ideal é `/api/otp/verificar` devolver um token curto de paciente e exigi-lo em `/api/sintomas/avaliacoes` e `/api/fila/:id/posicao`. Também vale um CSP no front (hoje há script inline em `painel.html`) e `FRONTEND_ORIGIN` fixo em produção.
