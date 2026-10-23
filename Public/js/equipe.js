// Aba "Equipe" do painel: solicitações de acesso pendentes (só administrador vê)
(function () {
  const prof = Auth.getProfissional();
  if (!prof || prof.cargo !== 'admin') return; // não admin: aba continua oculta

  const abaBtn = document.getElementById('tabEquipeBtn');
  const badge = document.getElementById('tabEquipeBadge');
  const lista = document.getElementById('pendentesLista');
  const vazio = document.getElementById('pendentesVazio');
  const erro = document.getElementById('pendErr');
  const CARGOS = { medico: 'Médico(a)', enfermeiro: 'Enfermeiro(a)', tecnico: 'Técnico(a) de enfermagem', recepcao: 'Recepção / Administrativo(a)' };

  abaBtn.hidden = false;

  function mostrarErro(msg) { erro.textContent = msg; erro.classList.add('show'); }

  function atualizarContagem() {
    const n = lista.children.length;
    badge.textContent = n;
    badge.hidden = n === 0;
    vazio.hidden = n > 0;
  }

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
    no.type = 'button'; no.className = 'pend-btn'; no.textContent = 'Recusar';
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
      atualizarContagem();
    } catch (e) {
      mostrarErro(e.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : e.message);
      li.querySelectorAll('button').forEach((b) => (b.disabled = false));
    }
  }

  async function carregar() {
    try {
      const itens = await Auth.listarSolicitacoes();
      lista.innerHTML = '';
      itens.forEach((p) => lista.appendChild(linha(p)));
      erro.classList.remove('show');
    } catch (e) {
      mostrarErro(e.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : e.message);
    }
    atualizarContagem();
  }

  carregar();
  abaBtn.addEventListener('click', carregar);   // atualiza ao abrir a aba
  setInterval(carregar, 30000);                  // e a cada 30 s (o contador avisa de novos pedidos)
})();
