-- =========================================================
-- MIGRAÇÃO — senhas únicas, encerramento automático e "sair da fila"
-- Rode UMA vez em bancos que já existiam antes desta mudança:
--   npm run db:migrar:senhas        (dentro de Backend/)
-- Bancos novos já nascem assim (criacaoTabela.sql). Pode rodar mais de uma vez.
-- Precisa vir DEPOIS das migrações de chamadas e avisos (usa as colunas delas).
--
--  1. senhas NUNCA se repetem: contador atômico por unidade + dia + prioridade
--     (antes era "conta quantas já existem": duas pessoas ao mesmo tempo recebiam a mesma senha)
--  2. o "dia" das senhas vira às 05:00 no horário de Brasília (antes virava às 21:00, pelo
--     relógio UTC do banco). Para outro fuso/horário, ajuste FUSO_HORARIO e HORA_VIRADA_DIA no .env
--     do servidor; aqui na migração valem os padrões (America/Sao_Paulo e 5 h) só para os dados antigos
--  3. nova situação 'expirado': senha sem NENHUMA atividade há 12 h é encerrada sozinha
--  4. só UMA senha ativa por paciente (índice único) e novo "desistencia_origem": quem saiu da fila
--     foi o próprio paciente ou o profissional marcou "não compareceu"
--
-- ATENÇÃO — esta migração ENCERRA dados antigos que já estavam errados:
--  - senhas ativas há mais de 12 h sem atividade passam para 'expirado';
--  - se um paciente tinha MAIS DE UMA senha ativa, fica a mais adiantada (em atendimento > chamando >
--    aguardando; empate: a mais recente) e as outras passam para 'expirado'.
-- =========================================================

-- 1) novo status 'expirado' (troca a regra de status; funciona mesmo se o nome da regra for outro)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'fila_atendimento'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%aguardando%' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE fila_atendimento DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE fila_atendimento ADD CONSTRAINT fila_atendimento_status_check
    CHECK (status IN ('aguardando', 'chamando', 'atendimento', 'finalizado', 'desistencia', 'expirado'));

-- 2) colunas novas
ALTER TABLE fila_atendimento
    ADD COLUMN IF NOT EXISTS dia_atendimento    DATE,
    ADD COLUMN IF NOT EXISTS expirado_em        TIMESTAMP,
    ADD COLUMN IF NOT EXISTS desistencia_origem VARCHAR(12)
        CHECK (desistencia_origem IN ('paciente', 'profissional'));

-- 3) dia de atendimento das senhas antigas (virada às 05:00, horário de Brasília)
UPDATE fila_atendimento
   SET dia_atendimento =
       (((created_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'America/Sao_Paulo')
        - interval '5 hours')::date
 WHERE dia_atendimento IS NULL;

-- quem desistiu antes desta versão foi marcado por um profissional (paciente não tinha como sair)
UPDATE fila_atendimento SET desistencia_origem = 'profissional'
 WHERE status = 'desistencia' AND desistencia_origem IS NULL;

-- 4) encerra senhas ativas sem nenhuma atividade há mais de 12 h
UPDATE fila_atendimento
   SET status = 'expirado', expirado_em = NOW()
 WHERE status IN ('aguardando', 'chamando', 'atendimento')
   AND GREATEST(created_at, chamado_em, ultima_chamada_em, atendimento_iniciado_em) < NOW() - interval '12 hours';

-- 5) paciente com mais de uma senha ativa: fica a mais adiantada, as outras expiram
WITH ordenadas AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY paciente_id
           ORDER BY CASE status WHEN 'atendimento' THEN 3 WHEN 'chamando' THEN 2 ELSE 1 END DESC,
                    created_at DESC, id DESC
         ) AS pos
    FROM fila_atendimento
   WHERE status IN ('aguardando', 'chamando', 'atendimento')
)
UPDATE fila_atendimento f
   SET status = 'expirado', expirado_em = NOW()
  FROM ordenadas o
 WHERE f.id = o.id AND o.pos > 1;

-- 6) uma senha ativa por paciente, garantido pelo banco
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fila_paciente_ativa
    ON fila_atendimento (paciente_id)
 WHERE status IN ('aguardando', 'chamando', 'atendimento');

CREATE INDEX IF NOT EXISTS idx_fila_paciente_status ON fila_atendimento (paciente_id, status);

-- 7) contador de senhas: um número por unidade + dia + prioridade, incrementado de forma atômica
CREATE TABLE IF NOT EXISTS contadores_senha (
    unidade_id  INT NOT NULL REFERENCES unidades_saude(id) ON DELETE CASCADE,
    dia         DATE NOT NULL,
    prioridade  SMALLINT NOT NULL CHECK (prioridade BETWEEN 0 AND 3),
    ultimo      INT NOT NULL DEFAULT 0,
    PRIMARY KEY (unidade_id, dia, prioridade)
);

-- continua de onde as senhas dos últimos dias pararam (a letra da senha diz a prioridade original)
INSERT INTO contadores_senha (unidade_id, dia, prioridade, ultimo)
SELECT unidade_id, dia_atendimento,
       CASE LEFT(senha, 1) WHEN 'E' THEN 0 WHEN 'U' THEN 1 WHEN 'P' THEN 2 ELSE 3 END,
       MAX(regexp_replace(senha, '\D', '', 'g')::int)
  FROM fila_atendimento
 WHERE LEFT(senha, 1) IN ('E', 'U', 'P', 'N')
   AND regexp_replace(senha, '\D', '', 'g') <> ''
   AND dia_atendimento >= CURRENT_DATE - 3
 GROUP BY 1, 2, 3
ON CONFLICT (unidade_id, dia, prioridade)
DO UPDATE SET ultimo = GREATEST(contadores_senha.ultimo, EXCLUDED.ultimo);

-- 8) senha única por unidade e dia (só cria se não houver repetidas antigas; o contador já
--    impede novas repetições de qualquer forma)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM fila_atendimento WHERE dia_atendimento IS NOT NULL
     GROUP BY unidade_id, dia_atendimento, senha HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_fila_senha_dia
        ON fila_atendimento (unidade_id, dia_atendimento, senha);
  ELSE
    RAISE NOTICE 'Existem senhas repetidas no mesmo dia (do sistema antigo): índice único de senha NÃO criado. As novas senhas já saem sem repetir.';
  END IF;
END $$;
