-- =========================================================
-- MIGRAÇÃO — aprovação de profissionais
-- Rode UMA vez em bancos que já existiam antes desta mudança:
--   npm run db:migrar
-- Quem já estava cadastrado continua 'ativo'.
-- =========================================================
ALTER TABLE profissionais
    ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'ativo';

ALTER TABLE profissionais DROP CONSTRAINT IF EXISTS profissionais_status_check;
ALTER TABLE profissionais
    ADD CONSTRAINT profissionais_status_check CHECK (status IN ('ativo', 'pendente', 'recusado'));
