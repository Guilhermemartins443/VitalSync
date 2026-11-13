// =========================================================
// Envio REAL do código de verificação (OTP) e dos avisos da fila, por WhatsApp ou SMS.
//
// Provedor escolhido por OTP_PROVEDOR:
//   'twilio'  -> envia de verdade (precisa das variáveis TWILIO_* abaixo)
//   'console' -> só escreve o código no terminal (apenas fora de produção)
// Sem OTP_PROVEDOR: usa 'twilio' se TWILIO_ACCOUNT_SID existir; senão 'console'.
//
// Variáveis do Twilio:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM   remetente de WhatsApp, ex.: +14155238886 (sandbox) ou o seu número aprovado
//   TWILIO_WHATSAPP_CODIGO_CONTENT_SID
//                          (recomendado em produção) modelo de mensagem APROVADO para o código, onde
//                          {{1}} é o código. O WhatsApp só entrega mensagem iniciada pela empresa
//                          (como o código) fora da janela de 24 h se for um modelo aprovado.
//   TWILIO_SMS_FROM        número/remetente de SMS, ex.: +15551234567 (opcional)
//
// Ordem de tentativa: o canal pedido primeiro (a tela pede WhatsApp); se falhar, tenta o outro canal
// SE ele estiver configurado (ex.: o paciente não tem WhatsApp -> chega por SMS).
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

// endereço da API do Twilio (só muda em testes automáticos, que usam um Twilio de mentira)
const TWILIO_BASE = () => process.env.TWILIO_API_BASE || 'https://api.twilio.com';

// Um envio, por UM canal. Lança erro FALHA_ENVIO (com .twilioCode e .status) se o provedor recusar.
async function enviarUmCanal({ canal, para, texto, codigo, sid, token }) {
  const params = canal === 'whatsapp'
    ? { To: `whatsapp:${para}`, From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}` }
    : { To: para, From: process.env.TWILIO_SMS_FROM };

  // Código por WhatsApp com modelo aprovado (produção): o Twilio manda o texto do modelo e só troca {{1}}
  const modelo = process.env.TWILIO_WHATSAPP_CODIGO_CONTENT_SID;
  if (canal === 'whatsapp' && modelo && codigo) {
    params.ContentSid = modelo;
    params.ContentVariables = JSON.stringify({ 1: String(codigo) });
  } else {
    params.Body = texto;
  }

  const resp = await fetch(`${TWILIO_BASE()}/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(8000),
  });

  if (!resp.ok) {
    let twilioCode = '';
    try { twilioCode = (await resp.json()).code || ''; } catch (_) { /* corpo não-JSON */ }
    // log sem telefone nem código: só o canal, o status e o código de erro do Twilio
    console.error(`Falha no envio (Twilio/${canal}): HTTP ${resp.status} ${twilioCode}`.trim());
    const e = erro('FALHA_ENVIO', 'O provedor recusou o envio.');
    e.twilioCode = twilioCode;
    e.status = resp.status;
    throw e;
  }
  return { canal };
}

async function enviarPorTwilio({ para, canal, texto, codigo }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw erro('SEM_PROVEDOR', 'Twilio sem TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.');

  const configurado = {
    whatsapp: !!process.env.TWILIO_WHATSAPP_FROM,
    sms: !!process.env.TWILIO_SMS_FROM,
  };
  // o canal pedido vai primeiro; o outro só entra se estiver configurado
  const ordem = (canal === 'sms' ? ['sms', 'whatsapp'] : ['whatsapp', 'sms']).filter((c) => configurado[c]);
  if (ordem.length === 0) {
    throw erro('SEM_PROVEDOR', 'Nenhum remetente configurado (TWILIO_WHATSAPP_FROM / TWILIO_SMS_FROM).');
  }

  let ultimoErro;
  for (const c of ordem) {
    try {
      return await enviarUmCanal({ canal: c, para, texto, codigo, sid, token });
    } catch (err) {
      ultimoErro = err;
      if (err.code !== 'FALHA_ENVIO' && err.name !== 'TimeoutError' && err.name !== 'TypeError') throw err;
      // WhatsApp recusou/caiu: tenta o próximo canal configurado (se houver)
    }
  }
  throw ultimoErro.code ? ultimoErro : erro('FALHA_ENVIO', 'O provedor não respondeu.');
}

// Devolve { canal } com o canal REALMENTE usado. Lança erro com .code:
//   'TELEFONE_INVALIDO' | 'SEM_PROVEDOR' | 'FALHA_ENVIO'
async function enviarCodigo({ telefone, canal, codigo, validadeMinutos }) {
  const para = normalizarTelefone(telefone);
  if (!para) throw erro('TELEFONE_INVALIDO', 'Telefone cadastrado inválido.');

  const texto = `VitalSync: seu código de verificação é ${codigo}. Vale por ${validadeMinutos} minutos. Não compartilhe com ninguém.`;
  const provedor = provedorAtivo();

  if (provedor === 'twilio') return enviarPorTwilio({ para, canal, texto, codigo });

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
