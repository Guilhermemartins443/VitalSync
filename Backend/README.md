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
npm run dev                # sobe a API em http://localhost:3000
```

Requer um PostgreSQL rodando e acessível pela `DATABASE_URL` do `.env`.

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

| Método | Rota                        | Quem usa (tela)          | Autenticação |
|--------|-----------------------------|---------------------------|--------------|
| GET    | `/api/unidades`             | paciente.html              | não          |
| POST   | `/api/pacientes`             | paciente.html              | não          |
| GET    | `/api/pacientes/cpf/:cpf`   | paciente.html, entrar.html | não          |
| GET    | `/api/pacientes/:id`        | painel.html                 | não*         |
| POST   | `/api/otp/solicitar`        | entrar.html                 | não          |
| POST   | `/api/otp/verificar`        | entrar.html                 | não          |
| POST   | `/api/auth/cadastro`        | cadastro.html               | não          |
| POST   | `/api/auth/login`           | login.html                  | não          |
| GET    | `/api/sintomas/catalogo`    | sintomas.html               | não          |
| POST   | `/api/sintomas/avaliacoes`  | sintomas.html               | não          |
| GET    | `/api/fila?unidade_id=`     | fila.html                   | não          |
| GET    | `/api/fila/:id/posicao`     | fila.html                   | não          |
| GET    | `/api/fila/:id`             | painel.html                 | **sim**      |
| PATCH  | `/api/fila/:id/status`      | painel.html                 | **sim**      |

`*` — dado de identificação do paciente; considere proteger também em
produção, dependendo de quem pode chamar essa rota.

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
- Falta rate limiting nas rotas públicas (`/api/otp/*`, `/api/pacientes`) — recomendado adicionar antes de expor a API publicamente.
