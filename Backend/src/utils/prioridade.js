// =========================================================
// Mesma regra de classificação usada no protótipo
// (Public/js/sintomas.js), agora do lado do servidor — é ela
// que decide de verdade a prioridade, o front-end só mostra
// o resultado.
// 0 = emergência, 1 = urgente, 2 = pouco urgente, 3 = não urgente
// =========================================================
const SINTOMAS_BANDEIRA_VERMELHA = ['dor_peito', 'falta_ar', 'sangramento', 'desmaio'];

function classificarPrioridade(sintomas = [], intensidade = 0) {
  const temBandeiraVermelha = sintomas.some((s) => SINTOMAS_BANDEIRA_VERMELHA.includes(s));
  if (temBandeiraVermelha || intensidade >= 9) return 0;

  const temFebre = sintomas.includes('febre');
  const temVomito = sintomas.includes('vomito');
  if (intensidade >= 7 || (temFebre && temVomito)) return 1;

  if (intensidade >= 4 || temFebre || temVomito || sintomas.includes('dor_cabeca')) return 2;

  return 3;
}

module.exports = { classificarPrioridade, SINTOMAS_BANDEIRA_VERMELHA };
