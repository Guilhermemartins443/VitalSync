// =========================================================
// Quem pode fazer o quê no prontuário (por cargo). Ajuste aqui se a regra da sua unidade for outra.
// Cargos: 'medico', 'enfermeiro', 'tecnico', 'recepcao', 'admin'.
// A recepção só mexe na FILA: não lê nem escreve nada clínico (minimização de dados, LGPD).
// =========================================================
const PERMISSOES = {
  lerProntuario: ['medico', 'enfermeiro', 'tecnico', 'admin'],
  evoluir: ['medico', 'enfermeiro', 'admin'],        // evolução e orientações
  prescrever: ['medico', 'admin'],                   // receita e ATESTADO
  lembrete: ['medico', 'enfermeiro', 'admin'],       // registrar lembrete de medicação
  reclassificar: ['medico', 'enfermeiro', 'admin'],  // mudar a prioridade (risco) de um paciente
};

function pode(cargo, acao) {
  return (PERMISSOES[acao] || []).includes(cargo);
}

// middleware: exigirPermissao('prescrever'); vem depois de autenticarProfissional
function exigirPermissao(acao) {
  return (req, res, next) => {
    if (!req.profissional || !pode(req.profissional.cargo, acao)) {
      return res.status(403).json({ erro: 'Seu cargo não tem permissão para esta ação.' });
    }
    next();
  };
}

module.exports = { PERMISSOES, pode, exigirPermissao };
