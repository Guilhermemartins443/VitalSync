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
    guiche                    VARCHAR(20),            -- guichê/sala informado por quem chama
    chamado_em                TIMESTAMP,              -- 1ª chamada (congela o tempo de espera)
    chamadas                  SMALLINT NOT NULL DEFAULT 0,  -- quantas vezes foi chamado (1ª + rechamadas)
    ultima_chamada_em         TIMESTAMP,              -- chamada mais recente
    desistencia_em            TIMESTAMP,              -- quando foi marcado como "não compareceu"
    avisos_ativos             BOOLEAN NOT NULL DEFAULT FALSE, -- paciente pediu aviso por WhatsApp/SMS (opt-in)
    aviso_proximo_em          TIMESTAMP,              -- quando mandamos "você é o próximo" (1 vez por espera)
    atendimento_iniciado_em   TIMESTAMP,
    atendimento_finalizado_em TIMESTAMP,
    created_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

-- índice pensado na query mais comum: "me dê a fila da unidade X, ordenada por prioridade"
CREATE INDEX idx_fila_unidade_status ON fila_atendimento(unidade_id, status, prioridade, created_at);

-- ---------------------------------------------------------
-- 9. PRONTUÁRIO (evolução, receitas, orientações/atestado, reclassificações)
-- Registros clínicos (dado sensível, LGPD): a aplicação só INSERE; não há edição nem exclusão.
-- Em bancos já existentes use: npm run db:migrar:prontuario
-- ---------------------------------------------------------
-- Evolução médica: anotação INTERNA do profissional. Nunca é mostrada ao paciente.
CREATE TABLE evolucoes_clinicas (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,       -- nome na hora do registro
    texto            TEXT NOT NULL CHECK (char_length(texto) BETWEEN 1 AND 5000),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_evolucoes_fila ON evolucoes_clinicas(fila_id, created_at);

-- Receita = um "documento" por profissional dentro do atendimento; os remédios ficam na tabela abaixo.
CREATE TABLE receitas (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_receitas_fila ON receitas(fila_id, created_at);

CREATE TABLE receita_medicamentos (
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
CREATE INDEX idx_receita_med_receita ON receita_medicamentos(receita_id);

-- Registro de lembretes de medicação enviados (o profissional abre WhatsApp/SMS; aqui só o log)
CREATE TABLE lembretes_medicamento (
    id              SERIAL PRIMARY KEY,
    medicamento_id  INT NOT NULL REFERENCES receita_medicamentos(id) ON DELETE CASCADE,
    profissional_id INT REFERENCES profissionais(id),
    canal           VARCHAR(10) NOT NULL CHECK (canal IN ('whatsapp', 'sms')),
    enviado_em      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lembretes_med ON lembretes_medicamento(medicamento_id);

-- Orientações pós-consulta (e atestado, quando emitido)
CREATE TABLE orientacoes (
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
CREATE INDEX idx_orientacoes_fila ON orientacoes(fila_id, created_at);

-- Histórico de reclassificação manual de risco (o MOTIVO que antes só existia no navegador)
CREATE TABLE reclassificacoes (
    id               SERIAL PRIMARY KEY,
    fila_id          INT NOT NULL REFERENCES fila_atendimento(id) ON DELETE CASCADE,
    profissional_id  INT REFERENCES profissionais(id),
    autor            VARCHAR(150) NOT NULL,
    de_prioridade    SMALLINT NOT NULL CHECK (de_prioridade BETWEEN 0 AND 3),
    para_prioridade  SMALLINT NOT NULL CHECK (para_prioridade BETWEEN 0 AND 3),
    motivo           VARCHAR(1000),
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reclass_fila ON reclassificacoes(fila_id, created_at);
