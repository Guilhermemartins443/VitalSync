/* =========================================================
   AVISOS — som, vibração e notificação quando o paciente é chamado
   =========================================================
   Roda na tela do paciente (fila.html). Funciona com a tela ABERTA, inclusive em segundo
   plano / tela bloqueada em alguns aparelhos; fechou a aba, o aviso passa a ser só a
   mensagem de WhatsApp/SMS (se o paciente pediu).

   Os navegadores só liberam som e vibração depois de um toque do usuário, por isso existe
   o botão "Ativar avisos". A preferência fica salva; depois de recarregar a página basta
   um toque em qualquer lugar da tela para o som voltar a ser liberado.

   Sem arquivo de áudio: o sinal é gerado na hora (Web Audio).
========================================================= */
const Avisos = (function () {
  const KEY = 'vitalsync_avisos';
  const tituloOriginal = document.title;

  let ctx = null;
  let ativo = false;
  let pisca = null;

  try { ativo = localStorage.getItem(KEY) === '1'; } catch (e) { ativo = false; }

  const temSom = !!(window.AudioContext || window.webkitAudioContext);
  const temVibracao = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const temNotificacao = 'Notification' in window;

  function criarContexto() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    return ctx;
  }

  function liberarSom() {
    const c = criarContexto();
    if (c && c.state === 'suspended') {
      try { return c.resume(); } catch (e) { /* segue */ }
    }
    return Promise.resolve();
  }

  function bip(c, inicio, frequencia, duracao) {
    const osc = c.createOscillator();
    const ganho = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequencia;
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.4, inicio + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    osc.connect(ganho);
    ganho.connect(c.destination);
    osc.start(inicio);
    osc.stop(inicio + duracao + 0.05);
  }

  // toca `quantos` bipes alternando duas notas; false se o navegador ainda bloqueia o som
  function tocar(quantos) {
    const c = criarContexto();
    if (!c || c.state !== 'running') return false;
    const t0 = c.currentTime;
    for (let i = 0; i < quantos; i += 1) bip(c, t0 + i * 0.34, i % 2 ? 988 : 784, 0.24);
    return true;
  }

  function vibrar(padrao) {
    if (!temVibracao) return;
    try { navigator.vibrate(padrao); } catch (e) { /* alguns aparelhos recusam */ }
  }

  function notificar(titulo, corpo) {
    // com a tela à vista o toast já avisa; a notificação do sistema é para aba em segundo plano
    if (!temNotificacao || Notification.permission !== 'granted' || !document.hidden) return;
    try { new Notification(titulo, { body: corpo, tag: 'vitalsync-fila' }); } catch (e) { /* sem suporte */ }
  }

  function pararPiscar() {
    if (pisca) { clearInterval(pisca); pisca = null; }
    document.title = tituloOriginal;
  }

  function piscarTitulo(texto) {
    pararPiscar();
    let alterna = false;
    pisca = setInterval(() => {
      document.title = alterna ? tituloOriginal : texto;
      alterna = !alterna;
    }, 1000);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) pararPiscar(); });

  // qualquer toque na tela volta a liberar o som depois de recarregar a página
  ['pointerdown', 'keydown'].forEach((ev) => {
    document.addEventListener(ev, () => { if (ativo) liberarSom(); }, { passive: true });
  });

  // ---------- API ----------
  async function ativar() {
    ativo = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* segue */ }
    await liberarSom();
    tocar(1);      // confirma que o som funciona
    vibrar(120);
    if (temNotificacao && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* recusado/sem suporte */ }
    }
  }

  function desativar() {
    ativo = false;
    try { localStorage.removeItem(KEY); } catch (e) { /* segue */ }
    pararPiscar();
  }

  // paciente foi chamado (rechamada = mais insistente)
  function chamado({ rechamada, senha, local }) {
    if (!ativo) return;
    tocar(rechamada ? 5 : 3);
    vibrar(rechamada ? [400, 150, 400, 150, 400, 150, 800] : [300, 150, 300, 150, 600]);
    notificar('VitalSync — é a sua vez!', `Senha ${senha}. ${local}`);
    if (document.hidden) piscarTitulo('🔔 É a sua vez!');
  }

  // virou o próximo da fila (aviso mais leve)
  function proximo({ senha }) {
    if (!ativo) return;
    tocar(1);
    vibrar([200]);
    notificar('VitalSync — você é o próximo', `Senha ${senha}. Fique por perto.`);
  }

  // para a tela mostrar o estado: 'desligado' | 'ativo' | 'toque' (ativo, mas o navegador pede um toque)
  function estado() {
    if (!ativo) return 'desligado';
    const c = ctx;
    if (temSom && (!c || c.state !== 'running')) return 'toque';
    return 'ativo';
  }

  return { ativar, desativar, chamado, proximo, estado, suporte: { som: temSom, vibracao: temVibracao, notificacao: temNotificacao } };
})();
