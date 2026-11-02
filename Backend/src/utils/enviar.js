// =========================================================
// Envio REAL do código de verificação (OTP) por SMS ou WhatsApp.
//
// Provedor escolhido por OTP_PROVEDOR:
//   'twilio'  -> envia de verdade (precisa das variáveis TWILIO_* abaixo)
//   'console' -> só escreve o código no terminal (apenas fora de produção)
// Sem OTP_PROVEDOR: usa 'twilio' se TWILIO_ACCOUNT_SID existir; senão 'console'.
//
// Variáveis do Twilio:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_SMS_FROM        número/remetente de SMS, ex.: +15551234567
//   TWILIO_WHATSAPP_FROM   remetente de WhatsApp, ex.: +14155238886 (sandbox) — opcional
//
// Para trocar de provedor (Zenvia, Meta WhatsApp Cloud API...), basta criar outra
// função como enviarPorTwilio e escolher nela pelo OTP_PROVEDOR.
// Sem dependência externa: usa o fetch nativo do Node 18+.
// =========================================================

// (11) 98221-3344 -> +5511982213344. Aceita também números já com 55 / +55.
function normalizarTelefone(telefone = '') {
  const d = String(telefone).replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return `+${d}`;
  return null;
}

function erro(code, mensagem) {
  const e = new Error(mensagem);
  e.code = code;
  return e;
}

function provedorAtivo() {
  if (process.env.OTP_PROVEDOR) return process.env.OTP_PROVEDOR.toLowerCase();
  return process.env.TWILIO_ACCOUNT_SID ? 'twilio' : 'console';
}

async function enviarPorTwilio({ para, canal, texto }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw erro('SEM_PROVEDOR', 'Twilio sem TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.');

  // WhatsApp sem remetente configurado cai para SMS; sem nenhum dos dois, não há como enviar.
  let canalReal = canal;
  if (canalReal === 'whatsapp' && !process.env.TWILIO_WHATSAPP_FROM) canalReal = 'sms';
  if (canalReal === 'sms' && !process.env.TWILIO_SMS_FROM) {
    if (process.env.TWILIO_WHATSAPP_FROM) canalReal = 'whatsapp';
    else throw erro('SEM_PROVEDOR', 'Nenhum remetente configurado (TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM).');
  }

  const origem = canalReal === 'whatsapp'
    ? `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`
    : process.env.TWILIO_SMS_FROM;
  const destino = canalReal === 'whatsapp' ? `whatsapp:${para}` : para;

  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: destino, From: origem, Body: texto }).toString(),
    signal: AbortSignal.timeout(8000),
  });

  if (!resp.ok) {
    let twilioCode = '';
    try { twilioCode = (await resp.json()).code || ''; } catch (_) { /* corpo não-JSON */ }
    // log sem telefone nem código: só o status e o código de erro do Twilio
    console.error(`Falha no envio (Twilio): HTTP ${resp.status} ${twilioCode}`.trim());
    throw erro('FALHA_ENVIO', 'O provedor recusou o envio.');
  }
  return { canal: canalReal };
}

// Devolve { canal } com o canal REALMENTE usado. Lança erro com .code:
//   'TELEFONE_INVALIDO' | 'SEM_PROVEDOR' | 'FALHA_ENVIO'
async function enviarCodigo({ telefone, canal, codigo, validadeMinutos }) {
  const para = normalizarTelefone(telefone);
  if (!para) throw erro('TELEFONE_INVALIDO', 'Telefone cadastrado inválido.');

  const texto = `VitalSync: seu código de verificação é ${codigo}. Vale por ${validadeMinutos} minutos. Não compartilhe com ninguém.`;
  const provedor = provedorAtivo();

  if (provedor === 'twilio') return enviarPorTwilio({ para, canal, texto });

  if (provedor === 'console' && process.env.NODE_ENV !== 'production') {
    console.log(`[OTP] ${canal} para ${para}: ${codigo}`);
    return { canal };
  }
  // produção sem provedor: NÃO finge que enviou
  throw erro('SEM_PROVEDOR', 'Nenhum provedor de SMS/WhatsApp configurado.');
}

// Mensagem avulsa (avisos da fila). Mesmo provedor e mesmas variáveis do código de verificação.
// Devolve { canal }. Lança erro com .code: 'TELEFONE_INVALIDO' | 'SEM_PROVEDOR' | 'FALHA_ENVIO'
async function enviarMensagem({ telefone, canal = 'whatsapp', texto }) {
  const para = normalizarTelefone(telefone);
  if (!para) throw erro('TELEFONE_INVALIDO', 'Telefone cadastrado inválido.');

  const provedor = provedorAtivo();
  if (provedor === 'twilio') return enviarPorTwilio({ para, canal, texto });

  if (provedor === 'console' && process.env.NODE_ENV !== 'production') {
    console.log(`[MSG] ${canal} para ${para}: ${texto}`);
    return { canal };
  }
  throw erro('SEM_PROVEDOR', 'Nenhum provedor de SMS/WhatsApp configurado.');
}

module.exports = { enviarCodigo, enviarMensagem, normalizarTelefone };
