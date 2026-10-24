/* =========================================================
   VITALSYNC VERDE — dados e utilitários COMPARTILHADOS
   Usado por verde.html (profissional) e verde-paciente.html (paciente).
   Todos os dados ambientais são DEMONSTRATIVOS. Para integrar fontes
   oficiais, troque AmbientDataSource: as duas páginas passam a usar.
========================================================= */

// ---------- DADOS DEMONSTRATIVOS ----------
const DEMO = {
  indicadores: [
    { id: 'ar', icon: 'air', cls: 'air', label: 'Qualidade do ar', value: '68', unit: 'IQAr', pct: 45, level: 'warn', chip: 'Moderada',
      desc: 'Grupos sensíveis (asma, idosos, crianças) devem evitar esforço intenso ao ar livre.' },
    { id: 'temp', icon: 'temp', cls: 'heat', label: 'Temperatura', value: '34', unit: '°C · sensação 37°C', pct: 78, level: 'bad', chip: 'Calor intenso',
      desc: 'Hidrate-se com frequência e evite sol entre 10h e 16h.' },
    { id: 'umid', icon: 'drop', cls: '', label: 'Umidade relativa', value: '38', unit: '%', pct: 38, level: 'warn', chip: 'Baixa',
      desc: 'Ar seco aumenta tosse e irritação nos olhos e nariz. Beba água e umidifique o ambiente.' },
    { id: 'uv', icon: 'sun', cls: 'warn', label: 'Índice UV', value: '9', unit: 'muito alto', pct: 82, level: 'bad', chip: 'Muito alto',
      desc: 'Use protetor solar, chapéu e busque sombra nos horários de pico.' },
    { id: 'chuva', icon: 'rain', cls: '', label: 'Chuva acumulada (7 dias)', value: '42', unit: 'mm', pct: 55, level: 'warn', chip: 'Atenção',
      desc: 'Água parada após chuva favorece criadouros do mosquito da dengue.' },
    { id: 'dengue', icon: 'bug', cls: 'bad', label: 'Risco de dengue', value: 'Alto', unit: '', pct: 80, level: 'bad', chip: 'Alerta',
      desc: 'Combinação de calor e chuva eleva a proliferação do Aedes aegypti.' },
  ],

  // fator ambiental -> aumento esperado de atendimentos (simulado)
  demanda: [
    { nome: 'Dengue (febre e dor no corpo)', pct: 22 },
    { nome: 'Calor extremo (desidratação)', pct: 15 },
    { nome: 'Poluição (queixas respiratórias)', pct: 12 },
    { nome: 'Ar seco (tosse e irritações)', pct: 8 },
  ],

  tipos: {
    dengue:   { label: 'Dengue',        cor: 'var(--v-dengue)', tag: 'tag-dengue',   cls: 't-dengue' },
    calor:    { label: 'Calor extremo', cor: 'var(--v-heat)',   tag: 'tag-calor',    cls: 't-calor' },
    poluicao: { label: 'Poluição',      cor: 'var(--v-air)',    tag: 'tag-poluicao', cls: 't-poluicao' },
  },

  // regiões do mapa esquemático (nomes alinhados às unidades do VitalSync)
  zonas: [
    { id: 'jardim',  nome: 'Jardim das Flores', unidade: 'UBS Jardim das Flores', pts: '30,30 210,20 230,150 40,160',  lx: 120, ly: 55 },
    { id: 'centro',  nome: 'Centro',            unidade: 'UBS Centro',            pts: '220,20 400,30 390,160 240,150', lx: 310, ly: 55 },
    { id: 'novaV',   nome: 'Vila Nova',         unidade: 'UPA Vila Nova',         pts: '410,30 570,40 560,170 400,160', lx: 485, ly: 62 },
    { id: 'industr', nome: 'Distrito Industrial', unidade: 'Sem unidade própria', pts: '40,175 230,165 250,370 50,360', lx: 135, ly: 205 },
    { id: 'ribeira', nome: 'Ribeirão',          unidade: 'Sem unidade própria',   pts: '245,165 395,175 385,365 262,370', lx: 320, ly: 205 },
    { id: 'altos',   nome: 'Altos do Sol',      unidade: 'Sem unidade própria',   pts: '405,175 565,185 555,360 395,365', lx: 480, ly: 208 },
  ],

  alertas: [
    { id: 1, tipo: 'dengue',   zona: 'ribeira', nivel: 'Alto',   x: 320, y: 255, titulo: 'Focos de Aedes aegypti',
      desc: 'Áreas com água parada após chuvas. Eliminar recipientes e reforçar visitas de agentes.', atualizado: 'há 2 h' },
    { id: 2, tipo: 'dengue',   zona: 'jardim',  nivel: 'Médio',  x: 110, y: 125, titulo: 'Aumento de casos suspeitos',
      desc: 'Queixas de febre e dor no corpo em crescimento. Atenção a sinais de alerta.', atualizado: 'há 5 h' },
    { id: 3, tipo: 'calor',    zona: 'altos',   nivel: 'Alto',   x: 500, y: 255, titulo: 'Sensação térmica acima de 37°C',
      desc: 'Risco de desidratação, principalmente para idosos e crianças. Buscar locais frescos.', atualizado: 'há 1 h' },
    { id: 4, tipo: 'calor',    zona: 'novaV',   nivel: 'Médio',  x: 480, y: 110, titulo: 'Calor persistente',
      desc: 'Vários dias seguidos de temperatura elevada. Reforçar hidratação.', atualizado: 'há 3 h' },
    { id: 5, tipo: 'poluicao', zona: 'industr', nivel: 'Alto',   x: 120, y: 280, titulo: 'Material particulado elevado',
      desc: 'Qualidade do ar ruim. Pessoas com asma ou DPOC devem evitar exposição prolongada.', atualizado: 'há 40 min' },
    { id: 6, tipo: 'poluicao', zona: 'centro',  nivel: 'Médio',  x: 300, y: 120, titulo: 'Tráfego intenso e ar seco',
      desc: 'Concentração de poluentes em horários de pico. Evitar exercício ao ar livre nesse período.', atualizado: 'há 1 h' },
  ],

  prevencao: [
    { icon: 'bug', cor: 'bad', titulo: 'Dengue',
      lead: 'O mosquito se reproduz em água parada. Dez minutos por semana já fazem diferença.',
      dicas: ['Vire garrafas, baldes e pneus de boca para baixo', 'Limpe calhas e ralos; tampe caixas d’água', 'Troque a água de pratos de plantas toda semana'],
      alerta: 'Procure a unidade se tiver febre alta, dor atrás dos olhos, manchas ou dor abdominal forte.' },
    { icon: 'recycle', cor: '', titulo: 'Descarte correto de resíduos',
      lead: 'Lixo mal descartado atrai pragas e entope drenagens, o que favorece doenças.',
      dicas: ['Separe recicláveis de orgânicos', 'Medicamentos vencidos vão a postos de coleta, nunca ao ralo', 'Nunca jogue lixo em terrenos ou córregos'],
      alerta: '' },
    { icon: 'air', cor: 'air', titulo: 'Poluição do ar',
      lead: 'Ar poluído agrava asma, bronquite e problemas cardíacos.',
      dicas: ['Em dias de ar ruim, evite exercício ao ar livre', 'Prefira caminhar, pedalar ou usar transporte coletivo', 'Nunca queime lixo ou folhas'],
      alerta: 'Falta de ar que não melhora é sinal de procurar atendimento.' },
    { icon: 'drop', cor: '', titulo: 'Economia de água',
      lead: 'Cada gota poupada protege o abastecimento e reduz estoques de água parada.',
      dicas: ['Banhos de até 5 minutos', 'Feche a torneira ao escovar os dentes', 'Reaproveite água da máquina para lavar o quintal'],
      alerta: '' },
    { icon: 'temp', cor: 'heat', titulo: 'Calor intenso',
      lead: 'Calor extremo pode causar desidratação e golpe de calor, sobretudo em idosos e crianças.',
      dicas: ['Beba água mesmo sem sede', 'Evite sol entre 10h e 16h', 'Use roupas leves e nunca deixe pessoas ou animais em carros fechados'],
      alerta: 'Confusão, pele quente e seca ou desmaio são emergência: busque ajuda imediatamente.' },
  ],

  kpis: [
    { label: 'Água', titulo: 'Redução do consumo', desc: 'Torneiras econômicas e captação de chuva.', pct: 18, txt: '−18%', cor: 'var(--g-500)' },
    { label: 'Energia', titulo: 'Consumo consciente', desc: 'Iluminação LED e desligamento programado.', pct: 12, txt: '−12%', cor: 'var(--v-warn)' },
    { label: 'Desperdícios', titulo: 'Materiais reaproveitados', desc: 'Menos descartáveis e melhor gestão de estoque.', pct: 64, txt: '64%', cor: 'var(--g-700)' },
    { label: 'Resíduos de saúde', titulo: 'Descarte adequado', desc: 'Perfurocortantes e infectantes com coleta e tratamento corretos.', pct: 98, txt: '98%', cor: 'var(--g-500)' },
  ],

  agua: { meses: ['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'], valores: [142, 138, 131, 124, 119, 116] },
};

// Conteúdo explicativo e tendências (DEMONSTRATIVO: séries de 7 dias fictícias)
Object.assign(DEMO, {
  guia: {
    ar: { impacto: 'Partículas no ar irritam as vias respiratórias e podem agravar asma, bronquite e doenças do coração.', rec: 'Evite exercício ao ar livre nos horários de pico e mantenha a medicação em dia.' },
    temp: { impacto: 'Calor extremo pode causar desidratação, câimbras e golpe de calor.', rec: 'Beba água mesmo sem sede e evite o sol entre 10h e 16h.' },
    umid: { impacto: 'Ar seco resseca as mucosas e piora tosse, rinite e irritação nos olhos.', rec: 'Hidrate-se, use soro fisiológico no nariz e umidifique o ambiente.' },
    uv: { impacto: 'Radiação UV elevada aumenta o risco de queimaduras e, com o tempo, de câncer de pele.', rec: 'Use protetor solar e chapéu e busque sombra nos horários de pico.' },
    chuva: { impacto: 'Água acumulada cria criadouros para o Aedes aegypti e pode causar alagamentos.', rec: 'Elimine água parada em vasos, pneus e calhas.' },
    dengue: { impacto: 'A dengue causa febre e dor no corpo e, nos casos graves, risco de hemorragia.', rec: 'Elimine criadouros e procure atendimento diante de sinais de alerta.' },
  },
  series: { ar: [52,58,61,66,70,69,68], temp: [31,32,33,33,35,34,34], umid: [52,48,45,42,40,39,38], uv: [8,8,9,9,9,9,9], chuva: [4,10,22,30,36,40,42], dengue: [40,48,55,64,72,78,80] },
  catPrev: { 'Dengue': 'Doenças', 'Descarte correto de resíduos': 'Água e resíduos', 'Poluição do ar': 'Clima e ar', 'Economia de água': 'Água e resíduos', 'Calor intenso': 'Clima e ar' },
  desafios: ['Fechar a torneira ao escovar os dentes todos os dias', 'Esvaziar pratos de plantas e baldes uma vez na semana', 'Trocar um trajeto curto de carro por caminhada ou bicicleta', 'Separar recicláveis em casa durante a semana'],
});

// ---------- FONTE DE DADOS (ponto de integração futura) ----------
// Hoje devolve dados demonstrativos. Trocar por fetch() a fontes oficiais.
const AmbientDataSource = {
  provider: 'demo',
  isDemo: true,
  fonte: 'Demonstrativa (nenhuma fonte oficial conectada)',
  atualizadoEm: null, // ao integrar uma fonte real, devolver a data/hora oficial da medição
  getIndicadores() { return Promise.resolve(DEMO.indicadores); },
  getAlertas()     { return Promise.resolve(DEMO.alertas); },
};

// ---------- ÍCONES (mesmo estilo de traço dos ícones do projeto) ----------
const ICONS = {
  air:  '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  temp: '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z"/>',
  drop: '<path d="M12 2.7c3.5 4 6 7 6 10.3a6 6 0 0 1-12 0c0-3.3 2.5-6.3 6-10.3z"/>',
  sun:  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  rain: '<path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/><path d="M8 19v2M12 19v2M16 19v2"/>',
  bug:  '<ellipse cx="12" cy="14" rx="4" ry="5"/><path d="M12 9V6M9 4l1.5 2M15 4l-1.5 2M8 12H4M16 12h4M8.5 16.5 5 19M15.5 16.5 19 19"/>',
  recycle: '<path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.6L5 13.5M12 4.5l1.8-3M16.6 9l3.2 5.5a1.8 1.8 0 0 1-1.6 2.7H15"/><path d="m11 16-3 3 3 3M13 7l3-3 3 3"/>',
};
function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- UTILITÁRIOS (armazenamento local, aviso, datas) ----------
const VStore = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem('vitalsync_verde_' + k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('vitalsync_verde_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
};
let toastT;
function toast(msg, erro) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'v-toast show' + (erro ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'v-toast'; }, 3200);
}
const fmtDT = d => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fmtD = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '—';
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const mesLabel = m => MESES[Number(m.split('-')[1]) - 1] + '/' + m.slice(2, 4);
function fillSel(id, arr) { document.getElementById(id).innerHTML = arr.map(v => `<option>${esc(v)}</option>`).join(''); }
function spark(v) {
  const w = 120, h = 28, mx = Math.max(...v), mn = Math.min(...v), r = (mx - mn) || 1;
  const p = v.map((x, k) => `${(k / (v.length - 1) * w).toFixed(1)},${(h - 2 - ((x - mn) / r) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="v-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="Tendência simulada dos últimos 7 dias: de ${v[0]} para ${v[v.length - 1]}"><polyline points="${p}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

