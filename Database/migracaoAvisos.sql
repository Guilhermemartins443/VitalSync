-- =========================================================
-- MIGRAÇÃO — guichê/sala de verdade + aviso por mensagem ao paciente
-- Rode UMA vez em bancos que já existiam antes desta mudança:
--   npm run db:migrar:avisos        (dentro de Backend/)
-- Bancos novos já nascem assim (criacaoTabela.sql). Pode rodar mais de uma vez.
--
--  guiche            passa de 10 para 20 caracteres ("Consultório 3", "Sala de triagem")
--  avisos_ativos     o paciente pediu para ser avisado por WhatsApp/SMS (opt-in na avaliação)
--  aviso_proximo_em  quando já mandamos "você é o próximo" (evita mensagem repetida)
-- =========================================================
ALTER TABLE fila_atendimento ALTER COLUMN guiche TYPE VARCHAR(20);

ALTER TABLE fila_atendimento
    ADD COLUMN IF NOT EXISTS avisos_ativos    BOOLEAN   NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS aviso_proximo_em TIMESTAMP;
