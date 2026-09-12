-- =========================================================
-- ACOLHESUS / VITALSYNC — DADOS INICIAIS (SEED)
-- Rode este arquivo DEPOIS do criacaoTabela.sql.
-- =========================================================

-- ---------------------------------------------------------
-- Unidades de saúde de exemplo
-- ---------------------------------------------------------
INSERT INTO unidades_saude (nome, tipo, endereco) VALUES
('UBS Jardim das Flores', 'UBS', 'Rua das Flores, 123'),
('UPA Vila Nova',         'UPA', 'Av. Central, 456'),
('UBS Centro',            'UBS', 'Praça Matriz, 10');

-- ---------------------------------------------------------
-- Catálogo de sintomas — as chaves batem com os checkboxes
-- de Public/sintomas.html (name="symptom" value="...")
-- ---------------------------------------------------------
INSERT INTO sintomas_catalogo (chave, label, is_red_flag) VALUES
('dor_peito',   'Dor no peito',        TRUE),
('falta_ar',    'Falta de ar',         TRUE),
('sangramento', 'Sangramento',         TRUE),
('desmaio',     'Tontura / desmaio',   TRUE),
('febre',       'Febre alta',          FALSE),
('vomito',      'Vômito persistente',  FALSE),
('dor_cabeca',  'Dor de cabeça forte', FALSE);
