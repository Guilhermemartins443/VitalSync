// Solicitações de acesso pendentes (só admin chega nesta tela — ver Auth.exigirLogin em cadastro.html)
(function () {
  const box = document.getElementById('pendentesBox');
  const lista = document.getElementById('pendentesLista');
  const erro = document.getElementById('pendErr');
  const CARGOS = { medico: 'Médico(a)', enfermeiro: 'Enfermeiro(a)', tecnico: 'Técnico(a) de enfermagem', recepcao: 'Recepção / Administrativo(a)' };

  function mostrarErro(msg) { erro.textContent = msg; erro.classList.add('show'); }

  function linha(p) {
    const li = document.createElement('li');
    li.className = 'pend-item';

    const info = document.createElement('div');
    const nome = document.createElement('strong');
    nome.textContent = p.nome;
    const det = document.createElement('span');
    det.textContent = `${p.email} · ${CARGOS[p.cargo] || p.cargo}`;
    info.append(nome, det);

    const acoes = document.createElement('div');
    acoes.className = 'pend-acoes';
    const ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'pend-btn pend-ok'; ok.textContent = 'Aprovar';
    const no = document.createElement('button');
    no.type = 'button'; no.className = 'pend-btn pend-no'; no.textContent = 'Recusar';
    ok.addEventListener('click', () => decidir(p.id, 'aprovar', li));
    no.addEventListener('click', () => decidir(p.id, 'recusar', li));
    acoes.append(ok, no);

    li.append(info, acoes);
    return li;
  }

  async function decidir(id, acao, li) {
    erro.classList.remove('show');
    li.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      await Auth.decidirSolicitacao(id, acao);
      li.remove();
      if (!lista.children.length) box.hidden = true;
    } catch (e) {
      mostrarErro(e.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : e.message);
      li.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  (async function carregar() {
    try {
      const itens = await Auth.listarSolicitacoes();
      if (!itens.length) return;
      itens.forEach((p) => lista.appendChild(linha(p)));
      box.hidden = false;
    } catch (e) { /* sem pendências visíveis se o servidor estiver fora */ }
  })();
})();
