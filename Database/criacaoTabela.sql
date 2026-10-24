-- =========================================================
-- ACOLHESUS / VITALSYNC — CRIAÇÃO DAS TABELAS
-- Escrito para PostgreSQL. Notas de adaptação para MySQL
-- estão comentadas ao lado de cada trecho que muda.
-- Rode este arquivo ANTES do insertScript.sql.
-- =========================================================

-- ---------------------------------------------------------
-- 1. UNIDADES DE SAÚDE
-- ---------------------------------------------------------
CREATE TABLE unidades_saude (
    id            SERIAL PRIMARY KEY,          -- MySQL: INT AUTO_INCREMENT PRIMARY KEY
    nome          VARCHAR(150) NOT NULL,
    tipo          VARCHAR(20)  NOT NULL CHECK (tipo IN ('UBS', 'UPA', 'HOSPITAL')),
    endereco      VARCHAR(255),
    telefone      VARCHAR(20),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- 2. PACIENTES
-- ---------------------------------------------------------
CREATE TABLE pacientes (
    id                     SERIAL PRIMARY KEY,
    cpf                    VARCHAR(11) NOT NULL UNIQUE,   -- guardar só dígitos, sem máscara
    nome_completo          VARCHAR(150) NOT NULL,
    data_nascimento        DATE NOT NULL,
    cns                    VARCHAR(15) UNIQUE,            -- cartão do SUS, opcional
    telefone               VARCHAR(20) NOT NULL,
    email                  VARCHAR(150),
    unidade_referencia_id  INT REFERENCES unidades_saude(id),
    created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pacientes_cpf ON pacientes(cpf);

-- ---------------------------------------------------------
-- 3. PROFISSIONAIS (login institucional)
-- ---------------------------------------------------------
CREATE TABLE profissionais (
    id           SERIAL PRIMARY KEY,
    nome         VARCHAR(150) NOT NULL,
    email        VARCHAR(150) NOT NULL UNIQUE,
    senha_hash   VARCHAR(255) NOT NULL,   -- nunca guardar senha em texto puro
    cargo        VARCHAR(30)  NOT NULL CHECK (cargo IN ('medico', 'enfermeiro', 'tecnico', 'recepcao', 'admin')),
    unidade_id   INT REFERENCES unidades_saude(id),
    status       VARCHAR(10)  NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'pendente', 'recusado')),  -- 'pendente' = pediu acesso e aguarda aprovação do admin
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- 4. CÓDIGOS DE VERIFICAÇÃO (login do paciente via OTP)
-- ---------------------------------------------------------
CREATE TABLE codigos_verificacao (
    id             SERIAL PRIMARY KEY,
    paciente_id    INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    codigo_hash    VARCHAR(255) NOT NULL,   -- hash do código, nunca o código em texto puro
    canal          VARCHAR(20)  NOT NULL CHECK (canal IN ('whatsapp', 'sms')),
    expira_em      TIMESTAMP NOT NULL,
    tentativas     SMALLINT NOT NULL DEFAULT 0,
    verificado_em  TIMESTAMP,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_codigos_paciente ON codigos_verificacao(paciente_id);

-- ---------------------------------------------------------
-- 5. CATÁLOGO DE SINTOMAS (lista fixa de sintomas associados)
-- ---------------------------------------------------------
CREATE TABLE sintomas_catalogo (
    id            SERIAL PRIMARY KEY,
    chave         VARCHAR(40)  NOT NULL UNIQUE,  -- ex: 'dor_peito'
    label         VARCHAR(100) NOT NULL,         -- ex: 'Dor no peito'
    is_red_flag   BOOLEAN NOT NULL DEFAULT FALSE -- sintomas que sozinhos já indicam emergência
);

-- ---------------------------------------------------------
-- 6. AVALIAÇÕES DE SINTOMAS (resultado do formulário de triagem)
-- ---------------------------------------------------------
CREATE TABLE avaliacoes_sintomas (
    id                            SERIAL PRIMARY KEY,
    paciente_id                   INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    unidade_id                    INT NOT NULL REFERENCES unidades_saude(id),
    descricao                     TEXT NOT NULL,
    tempo_inicio                  VARCHAR(10) NOT NULL CHECK (tempo_inicio IN ('agora', 'hoje', 'dias', 'semana')),
    intensidade                   SMALLINT NOT NULL CHECK (intensidade BETWEEN 0 AND 10),
    alergias_medicamentos         TEXT,
    prioridade_calculada          SMALLINT NOT NULL CHECK (prioridade_calculada BETWEEN 0 AND 3),
    -- 0 = emergência, 1 = urgente, 2 = pouco urgente, 3 = não urgente
    avaliado_por_profissional_id  INT REFERENCES profissionais(id),  -- preenchido se um profissional revisar/confirmar
    created_at                    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_avaliacoes_paciente ON avaliacoes_sintomas(paciente_id);

-- ---------------------------------------------------------
-- 7. SINTOMAS MARCADOS EM CADA AVALIAÇÃO (tabela de junção N:N)
-- ---------------------------------------------------------
CREATE TABLE avaliacao_sintoma (
    avaliacao_id  INT NOT NULL REFERENCES avaliacoes_sintomas(id) ON DELETE CASCADE,
    sintoma_id    INT NOT NULL REFERENCES sintomas_catalogo(id),
    PRIMARY KEY (avaliacao_id, sintoma_id)
);

-- ---------------------------------------------------------
-- 8. FILA DE ATENDIMENTO (senhas em tempo real)
-- ---------------------------------------------------------
CREATE TABLE fila_atendimento (
    id                        SERIAL PRIMARY KEY,
    paciente_id               INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    unidade_id                INT NOT NULL REFERENCES unidades_saude(id),
    avaliacao_id              INT REFERENCES avaliacoes_sintomas(id),
    senha                     VARCHAR(10) NOT NULL,   -- ex: 'P003', único por unidade e por dia
    prioridade                SMALLINT NOT NULL CHECK (prioridade BETWEEN 0 AND 3),
    status                    VARCHAR(20) NOT NULL DEFAULT 'aguardando'
                              CHECK (status IN ('aguardando', 'chamando', 'atendimento', 'finalizado', 'desistencia')),
    guiche                    VARCHAR(10),
    chamado_em                TIMESTAMP,
    atendimento_iniciado_em   TIMESTAMP,
    atendimento_finalizado_em TIMESTAMP,
    created_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- índice pensado na query mais comum: "me dê a fila da unidade X, ordenada por prioridade"
CREATE INDEX idx_fila_unidade_status ON fila_atendimento(unidade_id, status, prioridade, created_at);
