-- =========================================================
-- MIGRAÇÃO — rechamada e "não compareceu" na fila
-- Rode UMA vez em bancos que já existiam antes desta mudança:
--   npm run db:migrar:chamadas        (dentro de Backend/)
-- Bancos novos já nascem com estas colunas (criacaoTabela.sql).
--
--  chamadas           quantas vezes o paciente foi chamado na vez atual
--  ultima_chamada_em  hora da chamada mais recente (alerta "chamando há X min")
--  desistencia_em     hora em que foi marcado como "não compareceu"
-- O status 'desistencia' já existia no CHECK da tabela; aqui ele passa a ser usado.
-- =========================================================
ALTER TABLE fila_atendimento
    ADD COLUMN IF NOT EXISTS chamadas          SMALLINT  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ultima_chamada_em TIMESTAMP,
    ADD COLUMN IF NOT EXISTS desistencia_em    TIMESTAMP;

-- quem já está sendo chamado agora conta como 1ª chamada
UPDATE fila_atendimento
   SET chamadas = 1,
       ultima_chamada_em = COALESCE(chamado_em, NOW())
 WHERE status = 'chamando' AND chamadas = 0;
