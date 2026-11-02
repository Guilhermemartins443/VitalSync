-- =========================================================
-- MIGRAÇÃO — prontuário no banco (evolução, receitas, orientações/atestado, reclassificações)
-- Rode UMA vez em bancos que já existiam antes desta mudança:
--   npm run db:migrar:prontuario        (dentro de Backend/)
-- Bancos novos já nascem com estas tabelas (criacaoTabela.sql). Pode rodar mais de uma vez.
--
-- São registros CLÍNICOS (dado de saúde, sensível na LGPD): só têm INSERT pelo sistema; não existe
-- edição nem exclusão pela aplicação (histórico fica íntegro). Cada linha guarda quem escreveu e
-- quando. Se o paciente for apagado, tudo dele vai junto (ON DELETE CASCADE).
-- =========================================================

-- Evolução médica: anotação INTERNA do profissional. Nunca é mostrada ao paciente.
CREATE TABLE IF NOT EXISTS evolucoes_clinicas (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,       -- nome na hora do registro
    texto            TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 5000),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evolucoes_fila ON evolucoes_clinicas(fila_id, created_at);

-- Receita = um "documento" por profissional dentro do atendimento; os remédios ficam na tabela abaixo.
CREATE TABLE IF NOT EXISTS receitas (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receitas_fila ON receitas(fila_id, created_at);

CREATE TABLE IF NOT EXISTS receita_medicamentos (
    id          SERIAL PRIMARY KEY,
    receita_id  INT NOT NULL REFERENCES receitas(id) ON DELETE CASCADE,
    nome        VARCHAR(120) NOT NULL,
    dosagem     VARCHAR(80)  NOT NULL,
    posologia   VARCHAR(120) NOT NULL,
    duracao     VARCHAR(80)  NOT NULL,
    comprado    BOOLEAN NOT NULL DEFAULT FALSE,   -- o próprio paciente confirma compra/adesão
    comprado_em TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receita_med_receita ON receita_medicamentos(receita_id);

-- Registro de lembretes de medicação enviados (o profissional abre WhatsApp/SMS; aqui só o log)
CREATE TABLE IF NOT EXISTS lembretes_medicamento (
    id              SERIAL PRIMARY KEY,
    medicamento_id  INT NOT NULL REFERENCES receita_medicamentos(id) ON DELETE CASCADE,
    profissional_id INT REFERENCES profissionais(id),
    canal           VARCHAR(10) NOT NULL CHECK (canal IN ('whatsapp', 'sms')),
    enviado_em      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lembretes_med ON lembretes_medicamento(medicamento_id);

-- Orientações pós-consulta (e atestado, quando emitido)
CREATE TABLE IF NOT EXISTS orientacoes (
    id                SERIAL PRIMARY KEY,
    fila_id           INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id   INT REFERENCES profissionais(id),
    autor             VARCHAR(150) NOT NULL,
    texto             TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 5000),
    atestado          BOOLEAN NOT NULL DEFAULT FALSE,
    dias_afastamento  SMALLINT CHECK (dias_afastamento BETWEEN 1 AND 365),
    created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (atestado = (dias_afastamento IS NOT NULL))   -- atestado sempre com dias; sem atestado, sem dias
);
CREATE INDEX IF NOT EXISTS idx_orientacoes_fila ON orientacoes(fila_id, created_at);

-- Histórico de reclassificação manual de risco (o MOTIVO que antes só existia no navegador)
CREATE TABLE IF NOT EXISTS reclassificacoes (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,
    de_prioridade    SMALLINT NOT NULL CHECK (de_prioridade BETWEEN 0 AND 3),
    para_prioridade  SMALLINT NOT NULL CHECK (para_prioridade BETWEEN 0 AND 3),
    motivo           VARCHAR(1000),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reclass_fila ON reclassificacoes(fila_id, created_at);
