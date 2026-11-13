// =========================================================
// "Expediente" da unidade: quando um dia de senhas começa e quando uma senha esquecida
// deixa de valer. Três ajustes (todos opcionais, no .env do servidor):
//
//   FUSO_HORARIO         fuso da unidade                          (padrão: America/Sao_Paulo)
//   HORA_VIRADA_DIA      hora em que as senhas voltam a começar   (padrão: 5 = 05:00)
//   HORAS_VALIDADE_SENHA horas sem NENHUMA atividade até a senha  (padrão: 12)
//                        ser encerrada sozinha ("expirado")
//
// Por que 05:00 e não meia-noite: UPA/pronto atendimento funcionam de madrugada, e quem
// chegou 23:50 não pode ter a senha "virada" às 00:00. Às 05:00 quase ninguém está na fila.
// Por que "sem atividade" e não "virou o dia": quem espera 11 h e é chamado agora NÃO expira.
//
// Os valores são conferidos aqui e entram no SQL como texto (não vêm do usuário).
// =========================================================
const { query } = require('../db');

function inteiro(valor, padrao, min, max) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : padrao;
}

const FUSO = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(process.env.FUSO_HORARIO || '')
  ? process.env.FUSO_HORARIO
  : 'America/Sao_Paulo';
const HORA_VIRADA = inteiro(process.env.HORA_VIRADA_DIA, 5, 0, 23);
const HORAS_VALIDADE = inteiro(process.env.HORAS_VALIDADE_SENHA, 12, 1, 72);
// de quanto em quanto tempo (no máximo) o servidor varre senhas vencidas de uma unidade
const INTERVALO_VARREDURA_MS = inteiro(process.env.EXPEDIENTE_INTERVALO_MS, 60 * 1000, 0, 3600 * 1000);

const ATIVOS_SQL = "('aguardando', 'chamando', 'atendimento')";

// dia de atendimento de AGORA (data no fuso da unidade, deslocada pela hora de virada)
const DIA_AGORA_SQL = `((NOW() AT TIME ZONE '${FUSO}') - interval '${HORA_VIRADA} hours')::date`;

// última vez que algo aconteceu com a senha
const ULTIMA_ATIVIDADE_SQL = 'GREATEST(created_at, chamado_em, ultima_chamada_em, atendimento_iniciado_em)';
const VENCIDA_SQL = `${ULTIMA_ATIVIDADE_SQL} < NOW() - interval '${HORAS_VALIDADE} hours'`;

const ultimaVarredura = new Map(); // unidade_id -> instante da última varredura

// Encerra ('expirado') as senhas ativas da unidade sem atividade há HORAS_VALIDADE horas.
// Chamada de dentro das rotas de leitura da fila, no máximo 1x por minuto por unidade, então não
// precisa de agendador (cron). Devolve quantas foram encerradas. Nunca lança erro.
async function encerrarSenhasVencidas(unidadeId) {
  const agora = Date.now();
  if (agora - (ultimaVarredura.get(unidadeId) || 0) < INTERVALO_VARREDURA_MS) return 0;
  ultimaVarredura.set(unidadeId, agora);
  try {
    const r = await query(
      `UPDATE fila_atendimento SET status = 'expirado', expirado_em = NOW()
        WHERE unidade_id = $1 AND status IN ${ATIVOS_SQL} AND ${VENCIDA_SQL}`,
      [unidadeId]
    );
    return r.rowCount;
  } catch (err) {
    console.error('Falha ao encerrar senhas vencidas:', err.code || err.message);
    return 0;
  }
}

// Igual, mas só do paciente (de QUALQUER unidade): usado ao pedir uma senha nova, para uma
// senha esquecida de ontem, em outra unidade, não bloquear quem chegou hoje.
async function encerrarVencidasDoPaciente(pacienteId) {
  try {
    const r = await query(
      `UPDATE fila_atendimento SET status = 'expirado', expirado_em = NOW()
        WHERE paciente_id = $1 AND status IN ${ATIVOS_SQL} AND ${VENCIDA_SQL}`,
      [pacienteId]
    );
    return r.rowCount;
  } catch (err) {
    console.error('Falha ao encerrar senhas vencidas do paciente:', err.code || err.message);
    return 0;
  }
}

module.exports = {
  FUSO, HORA_VIRADA, HORAS_VALIDADE,
  ATIVOS_SQL, DIA_AGORA_SQL, ULTIMA_ATIVIDADE_SQL, VENCIDA_SQL,
  encerrarSenhasVencidas, encerrarVencidasDoPaciente,
};
