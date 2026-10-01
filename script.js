/* =========================================================
   SUPABASE
========================================================= */
const SUPABASE_URL = 'https://yfijtchpwohulhzamlre.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5kL_MJ5oYHzD0X5OCecCmQ_TZ5h-HiI';

/* =========================================================
   DETECÇÃO DE PLATAFORMA (PC x Mobile)
========================================================= */
const temToque = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const userAgentMovel = /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(navigator.userAgent);
const ehMobile = temToque || userAgentMovel;
const ehPC = !ehMobile;
document.body.classList.add(ehMobile ? 'plataforma-mobile' : 'plataforma-pc');

function vibrar(padrao) {
    if (ehMobile && navigator.vibrate) {
        try { navigator.vibrate(padrao); } catch { /* navegador sem permissão */ }
    }
}

(function dicaPlataforma() {
    const dica = document.getElementById('dicaControles');
    if (!dica) return;
    dica.textContent = ehPC
        ? '⌨ Use as setas ou WASD para controlar a cobra · ESC pausa'
        : '👆 Deslize na tela ou use as setas para controlar a cobra';
})();

/* =========================================================
   LOGIN / CONTA (Supabase Auth)
========================================================= */
const sb = (window.supabase && typeof window.supabase.createClient === 'function')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;
let usuarioLogado = null;

function nomeDaConta(user) {
    if (!user) return null;
    const meta = user.user_metadata || {};
    return meta.full_name || meta.name || meta.user_name
        || meta.preferred_username || (user.email ? user.email.split('@')[0] : null);
}

function mostrarMensagemLogin(texto, erro) {
    const el = document.getElementById('loginMensagem');
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('erro', !!erro);
    el.classList.remove('hide');
}

function atualizarUIAuth() {
    const logadoEl = document.getElementById('authLoggedIn');
    const deslogadoEl = document.getElementById('authLoggedOut');
    if (!logadoEl || !deslogadoEl) return;
    if (!sb) { deslogadoEl.classList.add('hide'); return; }
    logadoEl.classList.toggle('hide', !usuarioLogado);
    deslogadoEl.classList.toggle('hide', !!usuarioLogado);
    let textoBadge = '';
    if (usuarioLogado) {
        const nomeConta = (nomeDaConta(usuarioLogado) || 'Jogador').slice(0, 12);
        const nick = nickDaConta || (localStorage.snakeName || '').trim().slice(0, 12) || nomeConta;
        const avatar = document.getElementById('authAvatar');
        const rotulo = document.getElementById('authNomeUsuario');
        if (avatar) avatar.textContent = nick.charAt(0);
        if (rotulo) rotulo.textContent = nick;
        const inputNome = document.getElementById('name');
        if (inputNome) {
            if (!inputNome.value.trim()) inputNome.value = nick;
            inputNome.disabled = !!nickDaConta;
            inputNome.placeholder = nickDaConta ? 'Nick fixo da conta' : 'Escolha seu nick (só uma vez!)';
        }
        const provedor = (usuarioLogado.app_metadata && usuarioLogado.app_metadata.provider) || 'email';
        const nomeProvedor = provedor === 'google' ? 'Google' : provedor === 'facebook' ? 'Facebook' : 'Email';
        textoBadge = `✅ ${nomeProvedor} · ${nick}`;
    }
    const badgeRodape = document.getElementById('authBadgeRodape');
    if (badgeRodape) {
        badgeRodape.textContent = textoBadge;
        badgeRodape.classList.toggle('hide', !textoBadge);
    }
}

async function entrarComProvider(provider) {
    if (!sb) { mostrarMensagemLogin('Biblioteca de login não carregou. Verifique a conexão.', true); return; }
    mostrarMensagemLogin('Abrindo janela de login...', false);
    const { error } = await sb.auth.signInWithOAuth({
        provider, options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
        mostrarMensagemLogin(
            `Login com ${provider === 'google' ? 'Google' : 'Facebook'} indisponível: ative o provider no painel do Supabase (Authentication > Providers).`,
            true
        );
    }
}

async function entrarComEmail() {
    if (!sb) { mostrarMensagemLogin('Biblioteca de login não carregou. Verifique a conexão.', true); return; }
    const input = document.getElementById('loginEmail');
    const email = (input && input.value || '').trim();
    if (!email || !email.includes('@')) { mostrarMensagemLogin('Digite um email válido.', true); return; }
    mostrarMensagemLogin('Enviando link...', false);
    const { error } = await sb.auth.signInWithOtp({
        email, options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) { mostrarMensagemLogin('Não foi possível enviar: ' + error.message, true); return; }
    mostrarMensagemLogin('✉ Link enviado! Confira sua caixa de entrada (e o spam) e clique no link para entrar.', false);
    if (input) input.value = '';
}

async function sair() {
    if (!sb) return;
    await sb.auth.signOut();
    usuarioLogado = null;
    ultimoSyncProgresso = 0;
    nickDaConta = null;
    const inputNome = document.getElementById('name');
    if (inputNome) { inputNome.disabled = false; inputNome.placeholder = 'Nome do jogador'; }
    atualizarUIAuth();
}

/* =========================================================
   PROGRESSO NA CONTA
========================================================= */
let ultimoSyncProgresso = 0;
let nickDaConta = null;

async function tokenAuth() {
    if (!sb) return null;
    try {
        const { data } = await sb.auth.getSession();
        const sessao = data && data.session;
        return sessao ? sessao.access_token : null;
    } catch { return null; }
}

function estadoProgresso() {
    return {
        nick: (nickDaConta || localStorage.snakeName || 'Jogador').slice(0, 12),
        moedas: coins, xp: totalXP, skins: JSON.stringify([...ownedSkins]),
        skin_ativa: skin, tema: theme, dificuldade: diff, modo: mapMode,
        atualizado_em: new Date().toISOString()
    };
}

function aplicarProgresso(p) {
    if (!p) return;
    if (typeof p.nick === 'string' && p.nick) {
        nickDaConta = p.nick.slice(0, 12);
        localStorage.snakeName = nickDaConta;
        const inputNome = document.getElementById('name');
        if (inputNome) inputNome.value = nickDaConta;
    }
    if (typeof p.moedas === 'number' && p.moedas >= 0) { coins = p.moedas; localStorage.snakeCoins = coins; }
    if (typeof p.xp === 'number' && p.xp >= 0) { totalXP = p.xp; localStorage.snakeXP = totalXP; }
    if (typeof p.skins === 'string') {
        try {
            const lista = JSON.parse(p.skins);
            if (Array.isArray(lista)) { ownedSkins = new Set(lista); localStorage.snakeOwnedSkins = p.skins; }
        } catch { /* ignora skins corrompidas */ }
    }
    if (p.skin_ativa && SKIN_INFO[p.skin_ativa]) { skin = p.skin_ativa; localStorage.snakeSkin = skin; }
    if (p.tema && T[p.tema]) { theme = p.tema; localStorage.snakeTheme = theme; }
    if (p.dificuldade && D[p.dificuldade]) { diff = p.dificuldade; localStorage.snakeDiff = diff; }
    if (p.modo && MAPMODES.includes(p.modo)) { mapMode = p.modo; localStorage.snakeMapMode = mapMode; }
    apply();
    atualizarStatusJogador();
    renderTemas();
    renderDificuldades();
    renderModos();
}

async function salvarProgresso() {
    if (!sb || !usuarioLogado || !nickDaConta) return;
    try {
        const token = await tokenAuth();
        if (!token) return;
        const resposta = await fetch(`${SUPABASE_URL}/rest/v1/perfis`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({ user_id: usuarioLogado.id, ...estadoProgresso() })
        });
        if (!resposta.ok) console.error('Erro ao salvar progresso:', await resposta.text());
    } catch (erro) { console.error('Erro de conexão ao salvar progresso:', erro); }
}

async function sincronizarProgresso() {
    if (!sb || !usuarioLogado) return;
    if (Date.now() - ultimoSyncProgresso < 5000) return;
    ultimoSyncProgresso = Date.now();
    try {
        const token = await tokenAuth();
        if (!token) return;
        const resposta = await fetch(
            `${SUPABASE_URL}/rest/v1/perfis?select=*&user_id=eq.${usuarioLogado.id}`,
            { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` } }
        );
        if (!resposta.ok) { console.error('Erro ao carregar progresso:', await resposta.text()); return; }
        const lista = await resposta.json();
        if (lista && lista.length) {
            aplicarProgresso(lista[0]);
            atualizarUIAuth();
            if (!nickDaConta) mostrarEscolhaNick();
        } else {
            mostrarEscolhaNick();
        }
    } catch (erro) { console.error('Erro de conexão ao sincronizar progresso:', erro); }
}

let timerNick = null;
function nickAlterado() {
    if (!usuarioLogado) return;
    const novoNick = (localStorage.snakeName || '').trim().slice(0, 12);
    if (novoNick) nickDaConta = novoNick;
    clearTimeout(timerNick);
    timerNick = setTimeout(salvarProgresso, 1200);
}

/* =========================================================
   ESCOLHA DE NICK
========================================================= */
function mostrarEscolhaNick() {
    const modal = document.getElementById('modalNick');
    if (!modal || nickDaConta) return;
    const input = document.getElementById('nickEscolha');
    if (input && !input.value.trim()) input.value = (localStorage.snakeName || '').trim().slice(0, 12);
    modal.classList.remove('hide');
}
function esconderEscolhaNick() {
    const modal = document.getElementById('modalNick');
    if (modal) modal.classList.add('hide');
}
async function confirmarNick() {
    const input = document.getElementById('nickEscolha');
    const nick = ((input && input.value) || '').trim().slice(0, 12);
    if (!nick) { if (input) { input.placeholder = 'Digite um nick!'; input.focus(); } return; }
    nickDaConta = nick;
    localStorage.snakeName = nick;
    const inputNome = document.getElementById('name');
    if (inputNome) { inputNome.value = nick; inputNome.disabled = true; inputNome.placeholder = 'Nick fixo da conta'; }
    esconderEscolhaNick();
    await salvarProgresso();
    atualizarUIAuth();
}

async function salvarRanking(nome, pontuacao, tempo, modo) {
    if (devAtivo()) return; /* modo dev nunca mexe no ranking */
    const corpo = { nome, pontuacao, tempo, modo, dificuldade: diff };
    if (usuarioLogado) corpo.user_id = usuarioLogado.id;
    try {
        let resposta = await fetch(`${SUPABASE_URL}/rest/v1/ranking`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', 'Prefer': 'return=minimal'
            },
            body: JSON.stringify(corpo)
        });
        if (!resposta.ok && usuarioLogado) {
            delete corpo.user_id;
            resposta = await fetch(`${SUPABASE_URL}/rest/v1/ranking`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json', 'Prefer': 'return=minimal'
                },
                body: JSON.stringify(corpo)
            });
        }
        if (!resposta.ok) console.error('Erro ao salvar ranking:', await resposta.text());
    } catch (erro) { console.error('Erro de conexão com Supabase:', erro); }
}

async function carregarRanking(modo) {
    try {
        const resposta = await fetch(
            `${SUPABASE_URL}/rest/v1/ranking_melhores?select=nome,pontuacao,tempo,dificuldade,modo,criado_em&modo=eq.${encodeURIComponent(modo)}&order=pontuacao.desc,criado_em.asc&limit=50`,
            { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!resposta.ok) { console.error('Erro ao carregar ranking:', await resposta.text()); return null; }
        return await resposta.json();
    } catch (erro) { console.error('Erro de conexão com Supabase:', erro); return null; }
}

/* =========================================================
   TEMAS
========================================================= */
const T = {
    Dark:      [[10, 10, 15], [25, 25, 35], [45, 45, 55], [230, 230, 230]],
    Grama:     [[4, 20, 4], [12, 45, 12], [18, 65, 18], [140, 200, 140]],
    Oceano:    [[0, 15, 40], [0, 45, 90], [0, 80, 130], [180, 230, 255]],
    Lava:      [[45, 8, 5], [100, 25, 15], [150, 45, 15], [255, 170, 80]],
    Galaxia:   [[8, 6, 30], [25, 18, 65], [50, 30, 95], [180, 140, 230]],
    Neon:      [[5, 8, 15], [10, 35, 45], [20, 55, 65], [120, 220, 220]],
    Gelo:      [[5, 18, 30], [25, 70, 95], [40, 100, 130], [160, 210, 225]],
    Floresta:  [[5, 18, 7], [15, 50, 20], [25, 75, 30], [130, 190, 135]],
    Deserto:   [[35, 25, 10], [90, 70, 30], [130, 100, 45], [235, 205, 145]],
    Cyberpunk: [[10, 5, 20], [40, 10, 60], [70, 15, 100], [255, 60, 220]],
    Monocromo: [[10, 10, 10], [40, 40, 40], [70, 70, 70], [225, 225, 225]],
    PorDoSol:  [[30, 10, 20], [80, 20, 40], [130, 40, 50], [255, 150, 90]],
    Menta:     [[5, 20, 15], [10, 50, 35], [15, 75, 55], [140, 230, 190]],
    Vinho:     [[20, 5, 10], [60, 10, 25], [90, 15, 40], [230, 120, 150]],
    Esmeralda: [[3, 20, 12], [8, 55, 30], [12, 80, 45], [110, 230, 150]],
    Ametista:  [[15, 5, 25], [45, 15, 70], [70, 25, 105], [190, 140, 230]],
    Cobre:     [[20, 10, 5], [70, 35, 15], [110, 55, 25], [230, 150, 90]],
    Cosmos:    [[2, 2, 10], [10, 8, 30], [18, 14, 50], [160, 130, 255]]
};

/* =========================================================
   DIFICULDADE
========================================================= */
const D = { Normal: [13, 1], Insano: [15, 2] };
const MULTIPLICADOR_MACA = 1;
const C = ['#00ff00', '#0096ff', '#ff00ff', '#ffff00', '#ff7800', '#ff0000', '#00ffff'];

/* =========================================================
   MODOS DE MAPA
========================================================= */
const MAPMODES = ['Classico', 'SemParede', 'Infinito', 'Velocidade', 'Tempo', 'Obstaculos', 'Caos', 'Espelho', 'Gigante'];
const MAPMODE_LABEL = {
    Classico: 'Clássico', SemParede: 'Sem Parede', Infinito: 'Infinito', Velocidade: 'Velocidade',
    Tempo: 'Tempo', Obstaculos: 'Obstáculos', Caos: 'Caos', Espelho: 'Espelho', Gigante: 'Gigante 2x'
};
const LIMITE_TEMPO_MODO = 60;
function modoEncolheMapa() {
    if (devAtivo() && devConfig.semEncolher) return false;
    return mapMode === 'Classico' || mapMode === 'SemParede' || mapMode === 'Obstaculos';
}
function quantidadeMacas() {
    const dq = devVal('qtdMacas');
    if (dq) return dq;
    return (mapMode === 'Classico') ? 6 : 4;
}

/* =========================================================
   SKINS DA COBRA
========================================================= */
const SKIN_INFO = {
    Solida:    { nome: 'Sólida', custo: 0, nivel: 1 },
    Listrada:  { nome: 'Listrada', custo: 0, nivel: 1 },
    Retro:     { nome: 'Retrô', custo: 40, nivel: 4 },
    Gradiente: { nome: 'Gradiente', custo: 60, nivel: 4 },
    Gelo:      { nome: 'Gelo', custo: 90, nivel: 6 },
    Neon:      { nome: 'Neon', custo: 100, nivel: 6 },
    Espinhada: { nome: 'Espinhada', custo: 120, nivel: 8 },
    Camuflada: { nome: 'Camuflada', custo: 140, nivel: 8 },
    Fantasma:  { nome: 'Fantasma', custo: 150, nivel: 10 },
    ArcoIris:  { nome: 'Arco-íris', custo: 180, nivel: 10 },
    Dourada:   { nome: 'Dourada', custo: 200, nivel: 11 },
    Metalica:  { nome: 'Metálica', custo: 220, nivel: 12 },
    Toxica:    { nome: 'Tóxica', custo: 240, nivel: 13 },
    Fogo:      { nome: 'Fogo', custo: 260, nivel: 14 },
    Estelar:   { nome: 'Estelar', custo: 300, nivel: 15 },
    Cristal:   { nome: 'Cristal', custo: 320, nivel: 16 },
    Sombria:   { nome: 'Sombria', custo: 350, nivel: 17 },
    Aurora:    { nome: 'Aurora', custo: 380, nivel: 18 },
    Vulcanica: { nome: 'Vulcânica', custo: 420, nivel: 19 },
    Eletrica:  { nome: 'Elétrica', custo: 460, nivel: 20 },
    Prateada:  { nome: 'Prateada', custo: 500, nivel: 21 },
    Sanguinea: { nome: 'Sanguínea', custo: 550, nivel: 22 },
    Realeza:   { nome: 'Realeza', custo: 600, nivel: 23 },
    Marinha:   { nome: 'Marinha', custo: 650, nivel: 24 },
    Celestial: { nome: 'Celestial', custo: 700, nivel: 25 },
    Fenix:     { nome: 'Fênix', custo: 1200, nivel: 32 },
    Dragao:    { nome: 'Dragão Ancestral', custo: 1500, nivel: 35 },
    Cavaleiro: { nome: 'Cavaleiro Medieval', custo: 2000, nivel: 36 },
    Runico:    { nome: 'Rúnico Ancestral', custo: 2100, nivel: 37 },
    Titanio:   { nome: 'Titânio', custo: 2150, nivel: 39 },
    CircuitoNeon: { nome: 'Circuito Neon', custo: 2400, nivel: 40 },
    Plasma:    { nome: 'Plasma', custo: 2450, nivel: 41 },
    Samurai:   { nome: 'Samurai Carmesim', custo: 2600, nivel: 42 },
    Obsidiana: { nome: 'Obsidiana', custo: 2700, nivel: 43 },
    Quimera:   { nome: 'Quimera', custo: 2950, nivel: 44 },
    Aco:       { nome: 'Aço', custo: 3050, nivel: 45 },
    Vazio:     { nome: 'Vazio', custo: 3300, nivel: 46 },
    Nebulosa:  { nome: 'Nebulosa', custo: 3450, nivel: 47 },
    Cromada:   { nome: 'Cromada', custo: 3700, nivel: 48 },
    Vitral:    { nome: 'Vitral', custo: 3950, nivel: 49 },
    BuracoNegro: { nome: 'Buraco Negro', custo: 4400, nivel: 50 },
    Lendario:  { nome: 'Lendário', custo: 5000, nivel: 50 },
    Holografica: { nome: 'Holográfica', custo: 5200, nivel: 50 },
    Brasil:    { nome: 'Brasil', custo: 5400, nivel: 50 },
    Tribal:    { nome: 'Tribal Flamejante', custo: 5600, nivel: 51 },
    Cometa:    { nome: 'Cometa', custo: 5800, nivel: 52 },
    Pixel:     { nome: 'Pixel Art', custo: 6000, nivel: 53 },
    Coracao:   { nome: 'Coração Doce', custo: 6500, nivel: 54 },
    Abobora:   { nome: 'Abóbora Maldita', custo: 7000, nivel: 55 },
    Natalina:  { nome: 'Natalina', custo: 7500, nivel: 56 }
};
const SKINS = Object.keys(SKIN_INFO);

function escalaAtual() { return (mapMode === 'Gigante') ? 2 : 1; }

/* =========================================================
   CONFIGURAÇÕES DO MAPA
========================================================= */
const MAPA_INICIAL = 75;
const MAPA_MINIMO = 20;
const MAPA_TAMANHO_TELA = 1;
let mapSize = MAPA_INICIAL;
let mapaInicialAtual = MAPA_INICIAL;

/* =========================================================
   DADOS SALVOS
========================================================= */
let theme = localStorage.snakeTheme || 'Grama';
if (!T[theme]) theme = 'Grama';
let diff = localStorage.snakeDiff || 'Normal';
let rank = JSON.parse(localStorage.snakeRank || '[]');
let name = localStorage.snakeName || '';
let mapMode = localStorage.snakeMapMode || 'Classico';
let skin = localStorage.snakeSkin || 'Solida';
if (!SKIN_INFO[skin]) { skin = 'Solida'; localStorage.snakeSkin = skin; }

let coins = parseInt(localStorage.snakeCoins || '0', 10) || 0;
let totalXP = parseInt(localStorage.snakeXP || '0', 10) || 0;
let ownedSkins = new Set(JSON.parse(localStorage.snakeOwnedSkins || '["Solida","Listrada"]'));
[...ownedSkins].forEach(nSk => { if (!SKIN_INFO[nSk]) ownedSkins.delete(nSk); });
let coinsThisRun = 0;

function playerLevel() { return 1 + Math.floor(totalXP / 100); }
function skinDesbloqueada(nomeSkin) {
    return ownedSkins.has(nomeSkin) || playerLevel() >= SKIN_INFO[nomeSkin].nivel;
}

let obstacles = new Set();
let level = 1;

let s = [];
let prevS = [];
let dir = 'RIGHT';
let next = 'RIGHT';
let foods = [];
let rgb = null;
let rgbOn = false;
let grow = 0;
let score = 0;
let color = '';
let run = false;
let paused = false;

let start = 0;
let pausedAt = 0;
let totalPaused = 0;
let gameTime = 0;
let lastMove = 0;

let nextRgbScore = 20;
let velocidadeExtraApple = 0;

let proximoEventoCaos = 0;
let efeitoTemporario = null;
let mensagemEvento = '';
let mensagemEventoAte = 0;

const $ = id => document.getElementById(id);
const cv = $('canvas');
const ctx = cv.getContext('2d');
$('name').value = name;

function col(a) { return `rgb(${a[0]}, ${a[1]}, ${a[2]})`; }
function hexParaRgb(hex) {
    const v = hex.replace('#', '');
    return [parseInt(v.substring(0, 2), 16), parseInt(v.substring(2, 4), 16), parseInt(v.substring(4, 6), 16)];
}
function corEscura(hex) {
    const a = hexParaRgb(hex);
    return `rgb(${a[0] * 0.45 | 0}, ${a[1] * 0.45 | 0}, ${a[2] * 0.45 | 0})`;
}
function misturarComPreto(hex, fator) {
    const a = hexParaRgb(hex), f = 1 - fator;
    return `rgb(${a[0] * f | 0}, ${a[1] * f | 0}, ${a[2] * f | 0})`;
}

/* =========================================================
   DESENHAR SEGMENTO DA COBRA (por skin)

   [OTIMIZAÇÃO] Segmentos "simples=true" (cauda longe da
   cabeça) usam um preenchimento liso e barato — sem
   gradientes/shadowBlur recalculados a cada frame.
========================================================= */
function desenharSegmento(px, py, cell, i, tamanho, g, simples) {
    g = g || ctx;
    const m = cell * 0.05;
    const tam = cell * 0.90;

    if (simples) {
        g.fillStyle = (i % 2 === 0) ? color : corEscura(color);
        g.fillRect(px + m, py + m, tam, tam);
        return;
    }

    if (skin === 'Listrada') {
        g.fillStyle = (i % 2 === 0) ? color : corEscura(color);
        g.fillRect(px + m, py + m, tam, tam);

    } else if (skin === 'Gradiente') {
        const t2 = tamanho > 1 ? i / (tamanho - 1) : 0;
        g.fillStyle = misturarComPreto(color, t2 * 0.65);
        g.fillRect(px + m, py + m, tam, tam);

    } else if (skin === 'Neon') {
        g.shadowBlur = cell * 0.6;
        g.shadowColor = color;
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);

    } else if (skin === 'Retro') {
        /* Retrô: pixel de fliperama com brilho de tela CRT,
           cantos queimados e linha de varredura passando. */
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = 'rgba(255, 255, 255, 0.22)';
        g.fillRect(px + cell * 0.14, py + cell * 0.14, cell * 0.22, cell * 0.22);
        g.fillStyle = 'rgba(0, 0, 0, 0.25)';
        g.fillRect(px + cell * 0.60, py + cell * 0.60, cell * 0.26, cell * 0.26);
        const linhaCrt = (Date.now() / 6 + i * 13) % cell;
        g.fillStyle = 'rgba(0, 0, 0, 0.14)';
        g.fillRect(px + m, py + m + linhaCrt, tam, Math.max(1, cell * 0.06));
        g.strokeStyle = '#000';
        g.lineWidth = Math.max(1, cell * 0.09);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Gelo') {
        /* Gelo: cristal translúcido congelado, com rachaduras
           internas, aura fria pulsando e uma faísca de sol
           na neve de vez em quando. */
        const frio = Math.sin(Date.now() / 350 + i * 0.55) * 0.5 + 0.5;
        const gelo = g.createLinearGradient(px, py, px + cell, py + cell);
        gelo.addColorStop(0, `rgba(190, 235, 255, ${0.72 + frio * 0.18})`);
        gelo.addColorStop(0.5, `rgba(120, 195, 240, ${0.6 + frio * 0.2})`);
        gelo.addColorStop(1, `rgba(70, 140, 200, ${0.7 + frio * 0.15})`);
        g.shadowBlur = cell * (0.1 + frio * 0.3);
        g.shadowColor = '#9fdcff';
        g.fillStyle = gelo;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        g.lineWidth = Math.max(1, cell * 0.035);
        const semeG = (i * 7919) % 5;
        g.beginPath();
        g.moveTo(px + cell * (0.15 + semeG * 0.05), py + cell * 0.2);
        g.lineTo(px + cell * (0.42 + semeG * 0.04), py + cell * 0.5);
        g.lineTo(px + cell * (0.25 + semeG * 0.06), py + cell * 0.8);
        g.stroke();
        g.strokeStyle = `rgba(235, 252, 255, ${0.65 + frio * 0.35})`;
        g.lineWidth = Math.max(1, cell * 0.055);
        g.strokeRect(px + m, py + m, tam, tam);
        if (frio > 0.92) {
            g.fillStyle = '#ffffff';
            g.fillRect(px + cell * 0.42, py + cell * 0.05, cell * 0.16, cell * 0.05);
            g.fillRect(px + cell * 0.475, py, cell * 0.05, cell * 0.16);
        }

    /* ESPINHADA — redesenhada: pele escamada escura com um
       espinho ósseo saindo do topo, alternando de tamanho. */
    } else if (skin === 'Espinhada') {
        const escamas = g.createLinearGradient(px, py, px + cell, py + cell);
        escamas.addColorStop(0, '#3a1f1f');
        escamas.addColorStop(0.5, '#5c2b28');
        escamas.addColorStop(1, '#2a1414');
        g.fillStyle = escamas;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        g.lineWidth = Math.max(1, cell * 0.03);
        g.strokeRect(px + m, py + m, tam, tam);
        const grandeE = i % 2 === 0;
        const compE = cell * (grandeE ? 0.34 : 0.22);
        g.fillStyle = '#d8cbb0';
        g.beginPath();
        g.moveTo(px + cell * 0.32, py + m);
        g.lineTo(px + cell * 0.5, py + m - compE);
        g.lineTo(px + cell * 0.68, py + m);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(20, 15, 10, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.025);
        g.stroke();

    /* CAMUFLADA — redesenhada: padrão de manchas militares
       fixo (mesmo desenho toda vez), 3 tons de verde. */
    } else if (skin === 'Camuflada') {
        g.fillStyle = '#3d4d2c';
        g.fillRect(px + m, py + m, tam, tam);
        const manchasC = [
            [0.22, 0.28, 0.30, '#26311a'],
            [0.68, 0.24, 0.24, '#5a6b3a'],
            [0.30, 0.68, 0.26, '#5a6b3a'],
            [0.72, 0.66, 0.22, '#26311a']
        ];
        manchasC.forEach(mc => {
            g.fillStyle = mc[3];
            g.beginPath();
            g.ellipse(px + cell * mc[0], py + cell * mc[1], cell * mc[2], cell * mc[2] * 0.62, 0.6, 0, Math.PI * 2);
            g.fill();
        });
        g.strokeStyle = 'rgba(15, 20, 10, 0.55)';
        g.lineWidth = Math.max(1, cell * 0.035);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Fantasma') {
        g.globalAlpha = 0.45;
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);
        g.globalAlpha = 0.9;
        g.strokeStyle = color;
        g.lineWidth = Math.max(1, cell * 0.06);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'ArcoIris') {
        const matiz = (i * 18 + Date.now() / 15) % 360;
        g.fillStyle = `hsl(${matiz}, 80%, 55%)`;
        g.fillRect(px + m, py + m, tam, tam);

    } else if (skin === 'Metalica') {
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, '#e8e8ee');
        grad.addColorStop(0.35, misturarComPreto('#e8e8ee', 0.35));
        grad.addColorStop(0.6, '#ffffff');
        grad.addColorStop(1, misturarComPreto('#e8e8ee', 0.55));
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1;
        g.strokeRect(px + m, py + m, tam, tam);

    /* FOGO — redesenhada: núcleo em brasa com UMA língua de
       chama simples subindo, sem shadowBlur nem fagulhas. */
    } else if (skin === 'Fogo') {
        const corpoF = g.createLinearGradient(px, py + cell, px, py);
        corpoF.addColorStop(0, '#7a1400');
        corpoF.addColorStop(0.45, '#e8480a');
        corpoF.addColorStop(1, '#ffb020');
        g.fillStyle = corpoF;
        g.fillRect(px + m, py + m, tam, tam);
        const faseCh = (i * 37 % 5) / 5;
        const lx = px + cell * (0.32 + faseCh * 0.36);
        g.fillStyle = 'rgba(255, 210, 110, 0.85)';
        g.beginPath();
        g.moveTo(lx - cell * 0.1, py + cell * 0.6);
        g.quadraticCurveTo(lx, py + cell * 0.15, lx + cell * 0.1, py + cell * 0.6);
        g.closePath();
        g.fill();

    } else if (skin === 'Dourada') {
        /* Dourada Real: lingote de ouro polido com reflexo
           especular varrendo o corpo e diamante de brilho
           no centro de cada peça. */
        const fase = Math.sin(Date.now() / 450 + i * 0.5) * 0.5 + 0.5;
        const ouro = g.createLinearGradient(px, py, px + cell, py + cell);
        ouro.addColorStop(0, '#8a6410');
        ouro.addColorStop(0.35, '#ffd75a');
        ouro.addColorStop(0.5, '#fff3c4');
        ouro.addColorStop(0.65, '#e8b23a');
        ouro.addColorStop(1, '#6e4e0a');
        g.shadowBlur = cell * (0.12 + fase * 0.28);
        g.shadowColor = '#ffcf40';
        g.fillStyle = ouro;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        const xL = (((Date.now() / 800 + i * 0.3) % 1.5) - 0.25) * cell;
        const brilhoL = g.createLinearGradient(xL - cell * 0.2, py, xL + cell * 0.2, py + cell);
        brilhoL.addColorStop(0, 'rgba(255, 255, 255, 0)');
        brilhoL.addColorStop(0.5, 'rgba(255, 250, 220, 0.5)');
        brilhoL.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = brilhoL;
        g.fillRect(px + m, py + m, tam, tam);
        const cxD = px + cell / 2, cyD = py + cell / 2, dD = cell * 0.1;
        g.fillStyle = `rgba(255, 255, 240, ${0.55 + fase * 0.45})`;
        g.beginPath();
        g.moveTo(cxD, cyD - dD); g.lineTo(cxD + dD, cyD);
        g.lineTo(cxD, cyD + dD); g.lineTo(cxD - dD, cyD);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255, 240, 180, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Toxica') {
        /* Tóxica: gosma radioativa borbulhando com bolhas que
           sobem, aura venenosa pulsante e placa de perigo
           aparecendo a cada 4 pedaços. */
        const pulso = Math.sin(Date.now() / 150 + i * 0.8) * 0.5 + 0.5;
        const gosma = g.createLinearGradient(px, py, px, py + cell);
        gosma.addColorStop(0, `rgba(150, 255, 50, ${0.85 + pulso * 0.15})`);
        gosma.addColorStop(0.5, '#5ec414');
        gosma.addColorStop(1, '#2e6e08');
        g.shadowBlur = cell * (0.3 + pulso * 0.4);
        g.shadowColor = '#7cff2b';
        g.fillStyle = gosma;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        for (let b = 0; b < 2; b++) {
            const fase = (Date.now() / 900 + i * 0.5 + b * 0.5) % 1;
            const bx = px + cell * (0.3 + ((i * 13 + b * 29) % 40) / 100);
            const by = py + cell * (0.85 - fase * 0.65);
            g.fillStyle = `rgba(225, 255, 160, ${0.7 * (1 - fase)})`;
            g.beginPath();
            g.arc(bx, by, Math.max(1, cell * 0.06 * (1 - fase * 0.4)), 0, Math.PI * 2);
            g.fill();
        }
        if (i % 4 === 0) {
            g.fillStyle = 'rgba(25, 30, 20, 0.75)';
            g.beginPath();
            g.moveTo(px + cell * 0.5, py + cell * 0.26);
            g.lineTo(px + cell * 0.68, py + cell * 0.58);
            g.lineTo(px + cell * 0.32, py + cell * 0.58);
            g.closePath();
            g.fill();
            g.fillStyle = `rgba(216, 255, 94, ${0.7 + pulso * 0.3})`;
            g.fillRect(px + cell * 0.485, py + cell * 0.35, cell * 0.03, cell * 0.11);
            g.fillRect(px + cell * 0.485, py + cell * 0.50, cell * 0.03, cell * 0.03);
        }

    } else if (skin === 'Estelar') {
        /* Estelar: céu profundo de noite estrelada com
           estrelas titilando e uma estrela cadente cruzando
           de vez em quando. */
        g.fillStyle = '#0c0a24';
        g.fillRect(px + m, py + m, tam, tam);
        const semente = (i * 9301 + 49297) % 233280;
        for (let e = 0; e < 4; e++) {
            const s1 = (semente * (e + 1) * 9301) % 233280;
            const s2 = (semente * (e + 3) * 49297) % 233280;
            const ex = px + m + (s1 / 233280) * tam;
            const ey = py + m + (s2 / 233280) * tam;
            const titilaE = Math.sin(Date.now() / 300 + semente + e * 2.1) * 0.5 + 0.5;
            g.fillStyle = `rgba(255, 255, 255, ${0.35 + titilaE * 0.65})`;
            const tE = Math.max(1, cell * (e === 0 ? 0.11 : 0.07));
            g.fillRect(ex, ey, tE, tE);
        }
        const cad = (Date.now() / 1400 + i * 0.53) % 3;
        if (cad < 0.3) {
            const prog = cad / 0.3;
            const cxS = px + m + prog * tam;
            const cyS = py + m + prog * tam * 0.7;
            g.strokeStyle = `rgba(210, 235, 255, ${(1 - prog) * 0.9})`;
            g.lineWidth = Math.max(1, cell * 0.035);
            g.beginPath();
            g.moveTo(cxS, cyS);
            g.lineTo(cxS - cell * 0.22, cyS - cell * 0.16);
            g.stroke();
            g.fillStyle = '#ffffff';
            g.fillRect(cxS - cell * 0.03, cyS - cell * 0.03, Math.max(1.5, cell * 0.07), Math.max(1.5, cell * 0.07));
        }

    } else if (skin === 'Cristal') {
        /* Cristal: gema lapidada translúcida com facetas,
           luz interna pulsando e um lapso de luz cruzando
           a pedra de vez em quando. */
        const luzC = Math.sin(Date.now() / 280 + i * 0.5) * 0.5 + 0.5;
        const gem = g.createLinearGradient(px, py, px + cell, py + cell);
        gem.addColorStop(0, `rgba(196, 170, 255, ${0.55 + luzC * 0.2})`);
        gem.addColorStop(0.5, `rgba(242, 236, 255, ${0.5 + luzC * 0.25})`);
        gem.addColorStop(1, `rgba(130, 100, 220, ${0.6 + luzC * 0.2})`);
        g.shadowBlur = cell * (0.15 + luzC * 0.35);
        g.shadowColor = '#c9b2ff';
        g.fillStyle = gem;
        g.beginPath();
        g.moveTo(px + cell * 0.5, py + m);
        g.lineTo(px + tam + m, py + cell * 0.5);
        g.lineTo(px + cell * 0.5, py + tam + m);
        g.lineTo(px + m, py + cell * 0.5);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = `rgba(255, 255, 255, ${0.5 + luzC * 0.45})`;
        g.lineWidth = Math.max(1, cell * 0.045);
        g.stroke();
        g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        g.lineWidth = Math.max(1, cell * 0.03);
        g.beginPath();
        g.moveTo(px + cell * 0.5, py + cell * 0.22);
        g.lineTo(px + cell * 0.5, py + cell * 0.78);
        g.moveTo(px + cell * 0.22, py + cell * 0.5);
        g.lineTo(px + cell * 0.78, py + cell * 0.5);
        g.stroke();
        if (luzC > 0.92) {
            g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            g.lineWidth = Math.max(1, cell * 0.03);
            g.beginPath();
            g.moveTo(px + cell * 0.3, py + cell * 0.7);
            g.lineTo(px + cell * 0.7, py + cell * 0.3);
            g.stroke();
        }

    } else if (skin === 'Sombria') {
        /* Sombria: escuridão viva com fumaça roxa sussurrando
           e olhos espectrais que se abrem de vez em quando. */
        const respirarS = Math.sin(Date.now() / 700 + i * 0.5) * 0.5 + 0.5;
        const nevoa = g.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.05, px + cell / 2, py + cell / 2, cell * 0.55);
        nevoa.addColorStop(0, `rgba(70, 50, 120, ${0.5 + respirarS * 0.3})`);
        nevoa.addColorStop(0.6, 'rgba(25, 20, 45, 0.85)');
        nevoa.addColorStop(1, '#07050c');
        g.fillStyle = nevoa;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(140, 110, 220, ${0.2 + respirarS * 0.25})`;
        g.lineWidth = Math.max(1, cell * 0.04);
        g.lineCap = 'round';
        for (let fs = 0; fs < 2; fs++) {
            const yF = py + cell * (0.3 + fs * 0.35);
            g.beginPath();
            g.moveTo(px + m, yF);
            g.quadraticCurveTo(px + cell * 0.35, yF + Math.sin(Date.now() / 500 + i + fs * 2) * cell * 0.08, px + cell * 0.55, yF);
            g.quadraticCurveTo(px + cell * 0.75, yF - Math.cos(Date.now() / 500 + i + fs * 2) * cell * 0.08, px + tam + m, yF);
            g.stroke();
        }
        g.lineCap = 'butt';
        if (respirarS > 0.72) {
            g.fillStyle = `rgba(220, 190, 255, ${(respirarS - 0.72) * 2.8})`;
            g.fillRect(px + cell * 0.32, py + cell * 0.42, cell * 0.08, cell * 0.14);
            g.fillRect(px + cell * 0.58, py + cell * 0.42, cell * 0.08, cell * 0.14);
        }

    } else if (skin === 'Aurora') {
        /* Aurora Boreal: cortinas de luz verde-violeta
           ondulando no céu noturno, com pó de estrelas. */
        g.fillStyle = '#050816';
        g.fillRect(px + m, py + m, tam, tam);
        for (let cort = 0; cort < 3; cort++) {
            const faseA = Date.now() / 1100 + cort * 2 + i * 0.12;
            const matizA = 130 + cort * 55 + Math.sin(faseA) * 30;
            const xA = px + cell * (0.16 + cort * 0.26) + Math.sin(faseA * 1.4) * cell * 0.1;
            const cortina = g.createLinearGradient(xA, py + tam + m, xA + cell * 0.2, py);
            cortina.addColorStop(0, `hsla(${matizA}, 95%, 60%, 0)`);
            cortina.addColorStop(0.5, `hsla(${matizA}, 95%, 62%, 0.55)`);
            cortina.addColorStop(1, `hsla(${matizA + 60}, 95%, 70%, 0)`);
            g.fillStyle = cortina;
            g.fillRect(xA - cell * 0.13, py + m, cell * 0.26, tam);
        }
        const sementeA = (i * 4787 + 911) % 65535;
        for (let e = 0; e < 2; e++) {
            const titilaA = Math.sin(Date.now() / 400 + sementeA + e * 2.4) * 0.5 + 0.5;
            g.fillStyle = `rgba(255, 255, 255, ${0.2 + titilaA * 0.6})`;
            g.fillRect(px + m + (((sementeA * (e + 3)) % 97) / 97) * (tam - 2),
                py + m + (((sementeA * (e + 7)) % 89) / 89) * (tam - 2),
                Math.max(1, cell * 0.07), Math.max(1, cell * 0.07));
        }

    } else if (skin === 'Vulcanica') {
        /* Vulcão: rocha vulcânica escura com rachaduras de
           lava incandescente pulsando e brasas subindo. */
        const calor = Math.sin(Date.now() / 320 + i * 0.6) * 0.5 + 0.5;
        const rocha = g.createLinearGradient(px, py, px, py + cell);
        rocha.addColorStop(0, '#2a1210');
        rocha.addColorStop(1, '#140808');
        g.fillStyle = rocha;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(255, ${(90 + calor * 110) | 0}, 10, ${0.55 + calor * 0.45})`;
        g.shadowBlur = cell * (0.2 + calor * 0.35);
        g.shadowColor = '#ff5a00';
        g.lineWidth = Math.max(1, cell * 0.055);
        g.lineCap = 'round';
        const chaveV = (i * 37) % 3;
        g.beginPath();
        g.moveTo(px + m, py + cell * (0.3 + chaveV * 0.12));
        g.lineTo(px + cell * 0.38, py + cell * 0.52);
        g.lineTo(px + cell * 0.3, py + cell * 0.78);
        g.moveTo(px + cell * 0.38, py + cell * 0.52);
        g.lineTo(px + tam + m, py + cell * (0.62 - chaveV * 0.1));
        g.stroke();
        g.lineCap = 'butt';
        g.shadowBlur = 0;
        for (let br = 0; br < 2; br++) {
            const faseB = (Date.now() / 800 + i * 0.4 + br * 0.5) % 1;
            const bxV = px + cell * (0.25 + ((i * 17 + br * 43) % 50) / 100);
            const byV = py + cell * (0.85 - faseB * 0.75);
            g.fillStyle = `rgba(255, ${120 + br * 60}, 20, ${(1 - faseB) * 0.85})`;
            g.beginPath();
            g.arc(bxV, byV, Math.max(1, cell * 0.05 * (1 - faseB * 0.5)), 0, Math.PI * 2);
            g.fill();
        }
        g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Eletrica') {
        /* Elétrica: tempestade presa numa gaiola — relâmpagos
           rachando em zigue-zague e faísca estática girando. */
        const pulsoE = Math.sin(Date.now() / 80 + i * 1.1) * 0.5 + 0.5;
        const tempest = g.createLinearGradient(px, py, px, py + cell);
        tempest.addColorStop(0, '#0c2a52');
        tempest.addColorStop(0.5, `rgb(${30 + (pulsoE * 30 | 0)}, ${110 + (pulsoE * 50 | 0)}, 200)`);
        tempest.addColorStop(1, '#081c3a');
        g.shadowBlur = cell * (0.3 + pulsoE * 0.45);
        g.shadowColor = '#7ad0ff';
        g.fillStyle = tempest;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        const faixaR = (Date.now() / 400 + i * 0.29) % 2;
        if (faixaR < 0.25) {
            const forca = 1 - faixaR / 0.25;
            g.strokeStyle = `rgba(235, 250, 255, ${forca})`;
            g.shadowBlur = cell * 0.5 * forca;
            g.shadowColor = '#bfe9ff';
            g.lineWidth = Math.max(1, cell * 0.05);
            g.beginPath();
            g.moveTo(px + cell * 0.3, py + m);
            g.lineTo(px + cell * 0.62, py + cell * 0.3);
            g.lineTo(px + cell * 0.4, py + cell * 0.34);
            g.lineTo(px + cell * 0.66, py + tam + m);
            g.stroke();
            g.shadowBlur = 0;
        }
        const angF = (Date.now() / 150 + i * 2.4) % (Math.PI * 2);
        g.fillStyle = `rgba(200, 240, 255, ${0.4 + pulsoE * 0.6})`;
        g.fillRect(px + cell / 2 + Math.cos(angF) * cell * 0.32 - cell * 0.03,
            py + cell / 2 + Math.sin(angF) * cell * 0.32 - cell * 0.03,
            Math.max(1.5, cell * 0.06), Math.max(1.5, cell * 0.06));

    } else if (skin === 'Prateada') {
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, '#b8b8c0');
        grad.addColorStop(0.5, '#f4f4f8');
        grad.addColorStop(1, '#8c8c94');
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        g.lineWidth = 1;
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Sanguinea') {
        /* Sanguínea: sangue vivo com veias escuras
           serpenteando, pulso cardíaco inflando o brilho
           e um coração quente batendo no centro. */
        const batida = Math.pow(Math.sin(Date.now() / 300 + i * 0.6), 4);
        const sangue = g.createRadialGradient(px + cell / 2, py + cell / 2, cell * 0.08, px + cell / 2, py + cell / 2, cell * 0.55);
        sangue.addColorStop(0, `rgba(220, 30, 50, ${0.55 + batida * 0.4})`);
        sangue.addColorStop(0.6, '#7a0413');
        sangue.addColorStop(1, '#3c0208');
        g.shadowBlur = cell * (0.2 + batida * 0.45);
        g.shadowColor = '#c00018';
        g.fillStyle = sangue;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        g.strokeStyle = `rgba(90, 0, 12, ${0.6 + batida * 0.25})`;
        g.lineWidth = Math.max(1, cell * 0.05);
        const sv = (i * 31) % 7;
        g.beginPath();
        g.moveTo(px + m, py + cell * (0.25 + sv * 0.06));
        g.quadraticCurveTo(px + cell * 0.5, py + cell * (0.45 + sv * 0.04), px + tam + m, py + cell * (0.7 - sv * 0.05));
        g.stroke();
        if (batida > 0.75) {
            g.fillStyle = `rgba(255, 120, 130, ${(batida - 0.75) * 2.4})`;
            g.fillRect(px + cell * 0.42, py + cell * 0.42, cell * 0.16, cell * 0.16);
        }

    } else if (skin === 'Realeza') {
        /* Realeza: veludo púrpura real com reflexo de seda
           deslizando, moldura dourada cintilante e uma joia
           central que brilha como pedra de coroa. */
        const brilho = Math.sin(Date.now() / 300 - i * 0.6) * 0.5 + 0.5;
        const veludo = g.createLinearGradient(px, py, px + cell, py + cell);
        veludo.addColorStop(0, '#2a0845');
        veludo.addColorStop(0.5, '#8a3ff0');
        veludo.addColorStop(1, '#1c0530');
        g.fillStyle = veludo;
        g.fillRect(px + m, py + m, tam, tam);
        const xS = px + (((Date.now() / 900 + i * 0.21) % 1.4) - 0.2) * cell;
        const seda = g.createLinearGradient(xS - cell * 0.22, py, xS + cell * 0.22, py + cell);
        seda.addColorStop(0, 'rgba(255, 255, 255, 0)');
        seda.addColorStop(0.5, `rgba(230, 200, 255, ${0.10 + brilho * 0.22})`);
        seda.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = seda;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(255, 214, 90, ${0.5 + brilho * 0.5})`;
        g.lineWidth = Math.max(1, cell * 0.055);
        g.strokeRect(px + m, py + m, tam, tam);
        const cxR = px + cell / 2, cyR = py + cell / 2;
        g.shadowBlur = cell * (0.12 + brilho * 0.45);
        g.shadowColor = '#ffd75a';
        g.fillStyle = brilho > 0.5 ? '#ffe89a' : '#e0a83a';
        g.beginPath();
        g.arc(cxR, cyR, cell * (0.09 + brilho * 0.05), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        if (brilho > 0.93) {
            g.fillStyle = '#fffbe8';
            g.fillRect(cxR - cell * 0.02, cyR - cell * 0.17, cell * 0.04, cell * 0.34);
            g.fillRect(cxR - cell * 0.17, cyR - cell * 0.02, cell * 0.34, cell * 0.04);
        }

    } else if (skin === 'Marinha') {
        const onda = Math.sin(Date.now() / 150 + i * 0.6) * 0.5 + 0.5;
        const a1 = [0, 40, 90], a2 = [0, 130, 180];
        const r = (a1[0] + (a2[0] - a1[0]) * onda) | 0;
        const gg = (a1[1] + (a2[1] - a1[1]) * onda) | 0;
        const b = (a1[2] + (a2[2] - a1[2]) * onda) | 0;
        g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
        g.fillRect(px + m, py + m, tam, tam);

    } else if (skin === 'Celestial') {
        /* Celestial: céu divino dourado com raios de sol
           girando, lua crescente prateada e planeta com anel
           orbitando. */
        const rotC = Date.now() / 900 + i * 0.5;
        const ceu = g.createLinearGradient(px, py, px, py + cell);
        ceu.addColorStop(0, '#1a1f4e');
        ceu.addColorStop(0.55, '#283a7a');
        ceu.addColorStop(1, '#0c1030');
        g.fillStyle = ceu;
        g.fillRect(px + m, py + m, tam, tam);
        const cxC = px + cell / 2, cyC = py + cell / 2;
        g.save();
        g.translate(cxC, cyC);
        g.rotate(rotC);
        g.fillStyle = `rgba(255, 230, 150, ${0.18 + Math.sin(rotC * 2) * 0.08})`;
        for (let rC = 0; rC < 6; rC++) {
            g.rotate(Math.PI / 3);
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(cell * 0.5, -cell * 0.07);
            g.lineTo(cell * 0.5, cell * 0.07);
            g.closePath();
            g.fill();
        }
        g.restore();
        g.shadowBlur = cell * 0.45;
        g.shadowColor = '#ffe08a';
        g.fillStyle = '#ffdf8a';
        g.beginPath();
        g.arc(cxC, cyC, cell * 0.14, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = 'rgba(220, 230, 255, 0.9)';
        g.beginPath();
        g.arc(px + cell * 0.24, py + cell * 0.26, cell * 0.09, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#283a7a';
        g.beginPath();
        g.arc(px + cell * 0.28, py + cell * 0.23, cell * 0.08, 0, Math.PI * 2);
        g.fill();
        const angP = rotC * 1.6;
        const pxP = cxC + Math.cos(angP) * cell * 0.3;
        const pyP = cyC + Math.sin(angP) * cell * 0.16;
        g.fillStyle = '#7ab8ff';
        g.beginPath();
        g.arc(pxP, pyP, cell * 0.05, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255, 220, 160, 0.7)';
        g.lineWidth = Math.max(1, cell * 0.02);
        g.beginPath();
        g.ellipse(pxP, pyP, cell * 0.1, cell * 0.035, 0.5, 0, Math.PI * 2);
        g.stroke();

    } else if (skin === 'Fenix') {
        const pulso = Math.sin(Date.now() / 100 + i * 0.5) * 0.5 + 0.5;
        const cx = px + cell / 2, cy = py + cell / 2;
        const grad = g.createRadialGradient(cx, cy, cell * 0.05, cx, cy, cell * 0.55);
        grad.addColorStop(0, '#fff6d0');
        grad.addColorStop(0.35, '#ffb020');
        grad.addColorStop(0.7, '#ff5500');
        grad.addColorStop(1, `rgba(160, 20, 0, ${0.35 + pulso * 0.3})`);
        g.shadowBlur = cell * (0.5 + pulso * 0.4);
        g.shadowColor = '#ff6a00';
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, cell * 0.44, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < 2; k++) {
            const ang = ((i * 47 + k * 180 + Date.now() / 18) % 360) * Math.PI / 180;
            const dist = cell * 0.4;
            const fx = cx + Math.cos(ang) * dist;
            const fy = cy + Math.sin(ang) * dist;
            g.fillStyle = 'rgba(255, 225, 140, 0.85)';
            g.fillRect(fx, fy, cell * 0.09, cell * 0.09);
        }

    } else if (skin === 'Dragao') {
        /* Dragão Ancestral: escamas de guerreiro milenar com
           brilho esmeralda, espinho dorsal dourado respirando
           e uma brasa ancestral acesa no peito. */
        const resp = Math.sin(Date.now() / 500 + i * 0.4) * 0.5 + 0.5;
        const escamas = g.createLinearGradient(px, py, px + cell, py + cell);
        escamas.addColorStop(0, '#062413');
        escamas.addColorStop(0.45, `rgb(${28 + (resp * 14 | 0)}, ${110 + (resp * 30 | 0)}, 58)`);
        escamas.addColorStop(1, '#051c0e');
        g.fillStyle = escamas;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(8, 40, 22, ${0.55 + resp * 0.2})`;
        g.lineWidth = Math.max(1, cell * 0.035);
        for (let ln = 0; ln < 3; ln++) {
            const yy = py + cell * (0.24 + ln * 0.26);
            g.beginPath();
            g.moveTo(px + m, yy);
            for (let k = 0; k < 3; k++) {
                g.arc(px + cell * (0.24 + k * 0.28), yy, cell * 0.14, Math.PI, 0, false);
            }
            g.stroke();
        }
        const alturaEsp = cell * (0.14 + resp * 0.16);
        g.fillStyle = '#ffd75a';
        g.beginPath();
        g.moveTo(px + cell * 0.38, py + m);
        g.lineTo(px + cell * 0.5, py + m - alturaEsp);
        g.lineTo(px + cell * 0.62, py + m);
        g.closePath();
        g.fill();
        g.shadowBlur = cell * (0.15 + resp * 0.4);
        g.shadowColor = '#ffb020';
        g.fillStyle = `rgba(255, ${150 + (resp * 70 | 0)}, 40, ${0.5 + resp * 0.5})`;
        g.beginPath();
        g.arc(px + cell * 0.5, py + cell * 0.64, cell * (0.07 + resp * 0.05), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255, 215, 90, 0.5)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Cavaleiro') {
        /* Cavaleiro Medieval: armadura de aço polido com
           reflexo varrendo, rebites nos cantos e um penacho
           vermelho pulsando no peito. */
        const luz = (Date.now() / 700 + i * 0.13) % 1;
        const aco = g.createLinearGradient(px, py, px + cell, py + cell);
        aco.addColorStop(0, '#61656e');
        aco.addColorStop(0.5, '#c9cfda');
        aco.addColorStop(1, '#43464e');
        g.fillStyle = aco;
        g.fillRect(px + m, py + m, tam, tam);
        const xLuz = px + luz * cell * 1.6 - cell * 0.3;
        const fasco = g.createLinearGradient(xLuz - cell * 0.25, py, xLuz + cell * 0.25, py + cell);
        fasco.addColorStop(0, 'rgba(255, 255, 255, 0)');
        fasco.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');
        fasco.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = fasco;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = 'rgba(18, 20, 24, 0.85)';
        const rb = Math.max(1, cell * 0.05);
        [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]].forEach(pt => {
            g.beginPath();
            g.arc(px + cell * pt[0], py + cell * pt[1], rb, 0, Math.PI * 2);
            g.fill();
        });
        if (i % 2 === 0) {
            const pulso = Math.sin(Date.now() / 200 + i * 0.8) * 0.5 + 0.5;
            g.shadowBlur = cell * (0.12 + pulso * 0.35);
            g.shadowColor = '#d4142a';
            g.fillStyle = `rgb(${190 + pulso * 45 | 0}, 20, 40)`;
            g.beginPath();
            g.moveTo(px + cell * 0.5, py + cell * 0.18);
            g.quadraticCurveTo(px + cell * 0.82, py + cell * 0.5, px + cell * 0.5, py + cell * 0.82);
            g.quadraticCurveTo(px + cell * 0.18, py + cell * 0.5, px + cell * 0.5, py + cell * 0.18);
            g.fill();
            g.shadowBlur = 0;
        }
        g.strokeStyle = 'rgba(10, 12, 16, 0.55)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'CircuitoNeon') {
        /* Circuito Neon: placa escura com trilhas elétricas
           e um pulso de dados correndo pelas trilhas, com o
           LED central piscando a cada passagem. */
        g.fillStyle = '#050b12';
        g.fillRect(px + m, py + m, tam, tam);
        const pulsoP = (Date.now() / 500 + i * 0.35) % 1;
        g.strokeStyle = 'rgba(0, 234, 255, 0.75)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.beginPath();
        g.moveTo(px + m, py + cell * 0.5);
        g.lineTo(px + cell * 0.4, py + cell * 0.5);
        g.lineTo(px + cell * 0.4, py + m);
        g.moveTo(px + cell * 0.6, py + tam + m);
        g.lineTo(px + cell * 0.6, py + cell * 0.5);
        g.lineTo(px + tam + m, py + cell * 0.5);
        g.stroke();
        g.strokeStyle = '#aefcff';
        g.shadowBlur = cell * 0.45;
        g.shadowColor = '#00eaff';
        g.lineWidth = Math.max(1.5, cell * 0.06);
        if (pulsoP < 0.5) {
            const p1 = pulsoP * 2;
            g.beginPath();
            g.moveTo(px + m, py + cell * 0.5);
            g.lineTo(px + m + (cell * 0.4 - m) * p1, py + cell * 0.5);
            if (p1 > 0.85) g.lineTo(px + cell * 0.4, py + m);
            g.stroke();
        } else {
            const p2 = (pulsoP - 0.5) * 2;
            g.beginPath();
            g.moveTo(px + cell * 0.6, py + tam + m);
            g.lineTo(px + cell * 0.6, py + tam + m - (tam + m - cell * 0.5) * p2);
            if (p2 > 0.85) g.lineTo(px + tam + m, py + cell * 0.5);
            g.stroke();
        }
        g.shadowBlur = 0;
        const led = pulsoP < 0.1 || (pulsoP > 0.5 && pulsoP < 0.6);
        g.fillStyle = led ? '#dffbff' : '#00eaff';
        if (led) { g.shadowBlur = cell * 0.5; g.shadowColor = '#00eaff'; }
        g.beginPath();
        g.arc(px + cell * 0.5, py + cell * 0.5, cell * (led ? 0.09 : 0.06), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(0, 234, 255, 0.3)';
        g.lineWidth = 1;
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Samurai') {
        /* Samurai Carmesim: laca vermelho-sangue com onda
           dourada de estampa oriental, faixa de obi creme
           e um corte de katana reluzindo de vez em quando. */
        const onda = Math.sin(Date.now() / 260 + i * 0.9) * 0.5 + 0.5;
        const laca = g.createLinearGradient(px, py, px + cell, py + cell);
        laca.addColorStop(0, '#5c0a12');
        laca.addColorStop(0.5, '#a8162a');
        laca.addColorStop(1, '#3c060c');
        g.fillStyle = laca;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(255, 200, 80, ${0.35 + onda * 0.5})`;
        g.lineWidth = Math.max(1, cell * 0.05);
        g.lineCap = 'round';
        const yO = py + cell * 0.5 + (onda - 0.5) * cell * 0.24;
        g.beginPath();
        g.moveTo(px + m, yO);
        g.quadraticCurveTo(px + cell * 0.5, yO - cell * 0.22, px + tam + m, yO);
        g.stroke();
        g.lineCap = 'butt';
        if (i % 3 === 0) {
            g.fillStyle = '#efe6d0';
            g.fillRect(px + cell * 0.40, py + m, cell * 0.20, tam);
            g.fillStyle = '#c81e2e';
            g.fillRect(px + cell * 0.40, py + cell * 0.44, cell * 0.20, cell * 0.12);
        }
        const corte = (Date.now() / 900 + i * 0.37) % 4;
        if (corte < 0.22) {
            const a = 1 - corte / 0.22;
            g.strokeStyle = `rgba(255, 255, 255, ${0.85 * a})`;
            g.lineWidth = Math.max(1, cell * 0.06);
            g.beginPath();
            g.moveTo(px + cell * 0.12, py + cell * 0.82);
            g.lineTo(px + cell * 0.82, py + cell * 0.14);
            g.stroke();
        }
        g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Runico') {
        /* Rúnico Ancestral: pedra arcana com círculo de
           magia girando e glifo que se acende em sequência
           pelo corpo, transbordando energia roxa. */
        const carga = (Date.now() / 600 + i * 0.8) % 1;
        g.fillStyle = '#26262e';
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        g.lineWidth = 1;
        g.strokeRect(px + m, py + m, tam, tam);
        const cxr = px + cell / 2, cyr = py + cell / 2;
        g.strokeStyle = `rgba(200, 120, 255, ${0.3 + Math.sin(carga * Math.PI) * 0.3})`;
        g.lineWidth = Math.max(1, cell * 0.03);
        g.beginPath();
        g.arc(cxr, cyr, cell * 0.3, carga * Math.PI * 2, carga * Math.PI * 2 + Math.PI * 1.2);
        g.stroke();
        const aceso = Math.sin(carga * Math.PI);
        g.shadowBlur = cell * 0.45 * aceso;
        g.shadowColor = '#c878ff';
        g.strokeStyle = `rgba(${210 + (aceso * 45 | 0)}, ${130 + (aceso * 90 | 0)}, 255, ${0.5 + aceso * 0.5})`;
        g.lineWidth = Math.max(1, cell * 0.05);
        const rr = cell * 0.2;
        g.beginPath();
        g.moveTo(cxr, cyr - rr);
        g.lineTo(cxr + rr, cyr);
        g.lineTo(cxr, cyr + rr);
        g.lineTo(cxr - rr, cyr);
        g.closePath();
        g.moveTo(cxr - rr * 0.5, cyr - rr * 0.2);
        g.lineTo(cxr + rr * 0.5, cyr + rr * 0.2);
        g.stroke();
        g.shadowBlur = 0;

    } else if (skin === 'Titanio') {
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, '#3a4048');
        grad.addColorStop(0.5, '#8a95a3');
        grad.addColorStop(1, '#20242a');
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(160, 190, 210, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Plasma') {
        /* Plasma: energia contida girando em vórtice, com
           braços de luz e arco elétrico saltando de vez em
           quando. */
        const giro = Date.now() / 160 + i * 0.8;
        const cxa = px + cell / 2, cya = py + cell / 2;
        const vor = g.createRadialGradient(cxa, cya, cell * 0.04, cxa, cya, cell * 0.5);
        vor.addColorStop(0, '#f8e8ff');
        vor.addColorStop(0.35, '#c060ff');
        vor.addColorStop(0.7, '#7020c0');
        vor.addColorStop(1, 'rgba(30, 0, 70, 0.9)');
        g.shadowBlur = cell * 0.5;
        g.shadowColor = '#b040ff';
        g.fillStyle = vor;
        g.beginPath();
        g.arc(cxa, cya, cell * 0.44, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = `rgba(240, 200, 255, ${0.5 + Math.sin(giro) * 0.3})`;
        g.lineWidth = Math.max(1, cell * 0.05);
        g.lineCap = 'round';
        for (let bp = 0; bp < 3; bp++) {
            const ang = giro + bp * (Math.PI * 2 / 3);
            g.beginPath();
            g.arc(cxa, cya, cell * 0.26, ang, ang + 1.2);
            g.stroke();
        }
        g.lineCap = 'butt';
        const faixaP = (Date.now() / 700 + i * 0.31) % 3;
        if (faixaP < 0.25) {
            g.strokeStyle = `rgba(255, 255, 255, ${(1 - faixaP / 0.25) * 0.9})`;
            g.lineWidth = Math.max(1, cell * 0.03);
            g.beginPath();
            g.moveTo(cxa - cell * 0.3, cya + cell * 0.2);
            g.lineTo(cxa - cell * 0.05, cya - cell * 0.05);
            g.lineTo(cxa + cell * 0.05, cya + cell * 0.1);
            g.lineTo(cxa + cell * 0.3, cya - cell * 0.22);
            g.stroke();
        }

    } else if (skin === 'Obsidiana') {
        /* Obsidiana: vidro vulcânico preto com facetas de
           vidro afiadas, brilho espelhado deslizando e
           reflexos verde-violeta nas arestas. */
        const brilhoO = Math.sin(Date.now() / 500 + i * 0.45) * 0.5 + 0.5;
        const vidro = g.createLinearGradient(px, py, px + cell, py + cell);
        vidro.addColorStop(0, '#16121f');
        vidro.addColorStop(0.45, '#060509');
        vidro.addColorStop(0.55, '#0d0a14');
        vidro.addColorStop(1, '#1d1830');
        g.fillStyle = vidro;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = `rgba(120, 200, 170, ${0.14 + brilhoO * 0.2})`;
        g.beginPath();
        g.moveTo(px + m, py + m);
        g.lineTo(px + cell * 0.5, py + m);
        g.lineTo(px + m, py + cell * 0.5);
        g.closePath();
        g.fill();
        g.fillStyle = `rgba(150, 110, 255, ${0.12 + (1 - brilhoO) * 0.2})`;
        g.beginPath();
        g.moveTo(px + tam + m, py + tam + m);
        g.lineTo(px + cell * 0.5, py + tam + m);
        g.lineTo(px + tam + m, py + cell * 0.5);
        g.closePath();
        g.fill();
        const xO = (((Date.now() / 750 + i * 0.26) % 1.5) - 0.25) * cell;
        const esp = g.createLinearGradient(xO - cell * 0.15, py, xO + cell * 0.15, py + cell);
        esp.addColorStop(0, 'rgba(255, 255, 255, 0)');
        esp.addColorStop(0.5, `rgba(230, 220, 255, ${0.2 + brilhoO * 0.35})`);
        esp.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = esp;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `rgba(200, 255, 230, ${0.3 + brilhoO * 0.4})`;
        g.lineWidth = Math.max(1, cell * 0.035);
        g.beginPath();
        g.moveTo(px + m, py + cell * 0.5);
        g.lineTo(px + cell * 0.5, py + m);
        g.stroke();
        g.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Quimera') {
        const cores = ['#ff5050', '#50ff90', '#5090ff', '#ffe050'];
        g.fillStyle = cores[(i + Math.floor(px + py)) % cores.length];
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Vazio') {
        g.fillStyle = '#000';
        g.fillRect(px + m, py + m, tam, tam);
        const pulso = Math.sin(Date.now() / 130 + i) * 0.5 + 0.5;
        g.strokeStyle = `rgba(120, 60, 200, ${0.4 + pulso * 0.4})`;
        g.lineWidth = Math.max(1, cell * 0.06);
        g.beginPath();
        g.arc(px + cell / 2, py + cell / 2, cell * (0.15 + pulso * 0.15), 0, Math.PI * 2);
        g.stroke();

    } else if (skin === 'Aco') {
        /* Aço polido: gradiente frio de cinza-azulado com
           reflexo diagonal que se move levemente ao longo
           do corpo da cobra. */
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, '#5b6470');
        grad.addColorStop(0.45, '#dfe6ee');
        grad.addColorStop(0.55, '#aab4c0');
        grad.addColorStop(1, '#2e3440');
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(220, 235, 250, 0.55)';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);
        const brilhoX = ((i * 6 + Date.now() / 25) % (cell * 1.4)) - cell * 0.2;
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';
        g.fillRect(px + brilhoX, py + m, cell * 0.10, tam);

    } else if (skin === 'Nebulosa') {
        /* Nebulosa: nuvem cósmica roxa/azulada com brilho
           pulsante e estrelinhas que titilam pelo corpo. */
        const pulso = Math.sin(Date.now() / 700 + i * 0.35) * 0.5 + 0.5;
        const cxN = px + cell / 2, cyN = py + cell / 2;
        const grad = g.createRadialGradient(
            cxN - cell * 0.14, cyN - cell * 0.14, cell * 0.04,
            cxN, cyN, cell * 0.66
        );
        grad.addColorStop(0, '#e6c2ff');
        grad.addColorStop(0.32, '#9a5ae0');
        grad.addColorStop(0.62, `rgba(64, 28, 140, ${0.8 + pulso * 0.2})`);
        grad.addColorStop(0.85, 'rgba(30, 60, 160, 0.55)');
        grad.addColorStop(1, '#0d0620');
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        const semente = (i * 4787 + 911) % 65535;
        for (let e = 0; e < 3; e++) {
            const titila = Math.sin(Date.now() / 260 + semente + e * 2.4) * 0.5 + 0.5;
            const ex = px + m + (((semente * (e + 3)) % 97) / 97) * (tam - 2);
            const ey = py + m + (((semente * (e + 7)) % 89) / 89) * (tam - 2);
            g.fillStyle = `rgba(255, 255, 255, ${0.25 + titila * 0.75})`;
            g.fillRect(ex, ey, Math.max(1, cell * 0.08), Math.max(1, cell * 0.08));
        }
        g.strokeStyle = `rgba(200, 150, 255, ${0.25 + pulso * 0.3})`;
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Cromada') {
        /* Cromo: contraste extremo entre branco quase puro e
           cinza-escuro, trocando de posição a cada frame. */
        const fase = Math.sin(Date.now() / 200 + i * 0.5) * 0.5 + 0.5;
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, '#1c1f24');
        grad.addColorStop(Math.max(0.02, fase * 0.5), '#ffffff');
        grad.addColorStop(Math.min(0.98, 0.5 + fase * 0.4), '#6b7280');
        grad.addColorStop(1, '#0e1013');
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Vitral') {
        /* Vitral de catedral: 4 painéis de vidro colorido
           unidos por linhas de chumbo, com brilho de luz
           atravessando o vidro. */
        const matizBase = (i * 47) % 360;
        g.fillStyle = 'rgba(15, 12, 24, 0.95)';
        g.fillRect(px + m, py + m, tam, tam);
        const cxV = px + cell / 2, cyV = py + cell / 2;
        const desloc = [0, 120, 240, 300];
        for (let k = 0; k < 4; k++) {
            const brilhoPainel = 50 + Math.sin(Date.now() / 500 + i + k * 1.3) * 10;
            g.fillStyle = `hsl(${(matizBase + desloc[k]) % 360}, 80%, ${brilhoPainel}%)`;
            g.beginPath();
            if (k === 0) { g.moveTo(px + m, py + m); g.lineTo(px + tam + m, py + m); g.lineTo(cxV, cyV); }
            else if (k === 1) { g.moveTo(px + tam + m, py + m); g.lineTo(px + tam + m, py + tam + m); g.lineTo(cxV, cyV); }
            else if (k === 2) { g.moveTo(px + tam + m, py + tam + m); g.lineTo(px + m, py + tam + m); g.lineTo(cxV, cyV); }
            else { g.moveTo(px + m, py + tam + m); g.lineTo(px + m, py + m); g.lineTo(cxV, cyV); }
            g.closePath();
            g.fill();
        }
        const brilhoV = Math.sin(Date.now() / 900 + i * 0.7) * 0.5 + 0.5;
        g.fillStyle = `rgba(255, 255, 255, ${0.06 + brilhoV * 0.16})`;
        g.beginPath();
        g.moveTo(px + m, py + m);
        g.lineTo(px + tam + m, py + m);
        g.lineTo(px + m, py + tam + m);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        g.lineWidth = Math.max(1, cell * 0.08);
        g.strokeRect(px + m, py + m, tam, tam);
        g.beginPath();
        g.moveTo(cxV, py + m); g.lineTo(cxV, py + tam + m);
        g.moveTo(px + m, cyV); g.lineTo(px + tam + m, cyV);
        g.lineWidth = Math.max(1, cell * 0.06);
        g.stroke();

    } else if (skin === 'Lendario') {
        const matiz = (i * 20 + Date.now() / 10) % 360;
        g.shadowBlur = cell * 0.7;
        g.shadowColor = `hsl(${matiz}, 100%, 60%)`;
        g.fillStyle = `hsl(${matiz}, 100%, 60%)`;
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = '#fff8d0';
        g.lineWidth = Math.max(1, cell * 0.05);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Holografica') {
        const fase = (Date.now() / 8 + i * 14 + px * 0.7) % 360;
        const grad = g.createLinearGradient(px, py, px + cell, py + cell);
        grad.addColorStop(0, `hsla(${fase % 360}, 100%, 70%, 0.85)`);
        grad.addColorStop(0.5, `hsla(${(fase + 60) % 360}, 100%, 80%, 0.6)`);
        grad.addColorStop(1, `hsla(${(fase + 120) % 360}, 100%, 65%, 0.85)`);
        g.fillStyle = grad;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';
        g.fillRect(px + m, py + m, tam, Math.max(1, cell * 0.12));

    } else if (skin === 'Brasil') {
        g.fillStyle = '#009c3b';
        g.fillRect(px + m, py + m, tam, tam);
        const cxB = px + cell / 2, cyB = py + cell / 2, dB = cell * 0.34;
        g.fillStyle = '#ffdf00';
        g.beginPath();
        g.moveTo(cxB, cyB - dB); g.lineTo(cxB + dB, cyB);
        g.lineTo(cxB, cyB + dB); g.lineTo(cxB - dB, cyB);
        g.closePath(); g.fill();
        g.fillStyle = '#002776';
        g.beginPath();
        g.arc(cxB, cyB, cell * 0.13, 0, Math.PI * 2);
        g.fill();

    } else if (skin === 'BuracoNegro') {
        /* Buraco Negro: núcleo de escuridão absoluta com anel
           de fótons dourado e disco de acreção girando ao
           redor, com faíscas laranja e azuis em órbita. */
        const rot = Date.now() / 220 + i * 0.6;
        const cxB = px + cell / 2, cyB = py + cell / 2;
        for (let a = 0; a < 3; a++) {
            const ang = rot + a * (Math.PI * 2 / 3);
            const raioOrb = cell * 0.33;
            const ax = cxB + Math.cos(ang) * raioOrb;
            const ay = cyB + Math.sin(ang) * raioOrb * 0.5;
            const tamP = Math.max(1.5, cell * 0.09);
            g.fillStyle = a % 2 === 0 ? '#ffb347' : '#5cc8ff';
            g.shadowBlur = cell * 0.3;
            g.shadowColor = g.fillStyle;
            g.fillRect(ax - tamP / 2, ay - tamP / 2, tamP, tamP);
        }
        g.shadowBlur = 0;
        const halo = g.createRadialGradient(cxB, cyB, cell * 0.1, cxB, cyB, cell * 0.44);
        halo.addColorStop(0, 'rgba(255, 180, 80, 0.7)');
        halo.addColorStop(0.5, 'rgba(170, 60, 255, 0.32)');
        halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = halo;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(cxB, cyB, cell * 0.19, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(255, 232, 170, 0.95)';
        g.lineWidth = Math.max(1, cell * 0.035);
        g.beginPath();
        g.arc(cxB, cyB, cell * 0.215, 0, Math.PI * 2);
        g.stroke();

    } else if (skin === 'Tribal') {
        /* Tribal Flamejante: espinhos tribais em brasa sobre
           preto profundo, alternando de ponta pra cima e pra
           baixo, com brilho de brasa pulsando. */
        const pulso = Math.sin(Date.now() / 380 + i * 0.5) * 0.5 + 0.5;
        g.fillStyle = '#120b08';
        g.fillRect(px + m, py + m, tam, tam);
        g.strokeStyle = `hsl(${14 + pulso * 16}, 95%, ${44 + pulso * 14}%)`;
        g.lineWidth = Math.max(1.5, cell * 0.09);
        g.lineCap = 'round';
        const paraCima = i % 2 === 0;
        const baseY = paraCima ? py + tam + m : py + m;
        const pontaY = paraCima ? py + cell * 0.2 : py + tam - cell * 0.2 + m;
        g.beginPath();
        g.moveTo(px + m, baseY);
        g.lineTo(px + cell * 0.25, pontaY);
        g.lineTo(px + cell * 0.5, baseY);
        g.lineTo(px + cell * 0.75, pontaY);
        g.lineTo(px + tam + m, baseY);
        g.stroke();
        g.lineCap = 'butt';
        const cxC = px + cell / 2, cyC = py + cell / 2;
        g.fillStyle = `rgba(255, ${150 + pulso * 80}, 40, ${0.45 + pulso * 0.55})`;
        g.shadowBlur = cell * 0.25 * pulso;
        g.shadowColor = '#ff7a1f';
        g.beginPath();
        g.arc(cxC, cyC, cell * 0.09, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;

    } else if (skin === 'Cometa') {
        const cx = px + cell / 2, cy = py + cell / 2;
        const gradCauda = g.createLinearGradient(px, py, px + cell, py + cell);
        gradCauda.addColorStop(0, 'rgba(120, 200, 255, 0)');
        gradCauda.addColorStop(1, 'rgba(160, 220, 255, 0.55)');
        g.fillStyle = gradCauda;
        g.fillRect(px + m, py + m, tam, tam);
        const gradNucleo = g.createRadialGradient(cx, cy, cell * 0.04, cx, cy, cell * 0.45);
        gradNucleo.addColorStop(0, '#ffffff');
        gradNucleo.addColorStop(0.4, '#9fd8ff');
        gradNucleo.addColorStop(1, 'rgba(40, 120, 220, 0.15)');
        g.shadowBlur = cell * 0.55;
        g.shadowColor = '#8ecbff';
        g.fillStyle = gradNucleo;
        g.beginPath();
        g.arc(cx, cy, cell * 0.4, 0, Math.PI * 2);
        g.fill();
        const angC = (Date.now() / 300 + i) % (Math.PI * 2);
        g.fillStyle = 'rgba(255, 255, 255, 0.8)';
        g.fillRect(cx + Math.cos(angC) * cell * 0.3 - cell * 0.04, cy + Math.sin(angC) * cell * 0.3 - cell * 0.04, cell * 0.08, cell * 0.08);

    } else if (skin === 'Pixel') {
        /* Pixel Art: mosaico 4x4 de pixels que muda de
           padrão em passos, como um sprite de 8 bits vivo. */
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);
        const q = cell / 4;
        const quadro = Math.floor(Date.now() / 450 + i * 0.9) % 4;
        const padroesP = [
            [[1, 2], [2, 1], [3, 3]],
            [[0, 1], [2, 2], [3, 0]],
            [[1, 1], [2, 3], [3, 2]],
            [[0, 3], [2, 0], [3, 1]]
        ];
        g.fillStyle = 'rgba(255, 255, 255, 0.35)';
        padroesP[quadro].forEach(pp => {
            g.fillRect(px + m + pp[0] * q, py + m + pp[1] * q, Math.ceil(q), Math.ceil(q));
        });
        g.fillStyle = 'rgba(0, 0, 0, 0.3)';
        padroesP[(quadro + 2) % 4].forEach(pp => {
            g.fillRect(px + m + pp[0] * q, py + m + pp[1] * q, Math.ceil(q), Math.ceil(q));
        });
        const borda = Math.max(1, q * 0.6);
        g.fillStyle = 'rgba(0, 0, 0, 0.8)';
        g.fillRect(px + m, py + m, tam, borda);
        g.fillRect(px + m, py + tam + m - borda, tam, borda);
        g.fillRect(px + m, py + m, borda, tam);
        g.fillRect(px + tam + m - borda, py + m, borda, tam);

    } else if (skin === 'Coracao') {
        g.fillStyle = '#ff5c8a';
        g.fillRect(px + m, py + m, tam, tam);
        const mapaCoracao = [
            [0, 1, 0, 1, 0],
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 1],
            [0, 1, 1, 1, 0],
            [0, 0, 1, 0, 0]
        ];
        const pc = cell / 7;
        const ox = px + cell * 0.5 - pc * 2.5, oy = py + cell * 0.5 - pc * 2.5;
        g.fillStyle = '#ffffff';
        mapaCoracao.forEach((linha, ly) => linha.forEach((v, lx) => {
            if (v) g.fillRect(ox + lx * pc, oy + ly * pc, Math.ceil(pc), Math.ceil(pc));
        }));

    } else if (skin === 'Abobora') {
        /* Abóbora Maldita: rosto entalhado com fogo roxo
           dentro, gomos de abóbora, caule torto e aura
           maldita pulsando. */
        const maldita = Math.sin(Date.now() / 350 + i * 0.6) * 0.5 + 0.5;
        const casca = g.createLinearGradient(px, py, px, py + cell);
        casca.addColorStop(0, `rgb(${255 - (maldita * 30 | 0)}, ${117 + (maldita * 20 | 0)}, 24)`);
        casca.addColorStop(1, '#b34a00');
        g.fillStyle = casca;
        g.fillRect(px + m, py + m, tam, tam);
        g.fillStyle = 'rgba(160, 60, 0, 0.45)';
        g.fillRect(px + cell * 0.3 + m, py + m, Math.max(1, cell * 0.06), tam);
        g.fillRect(px + cell * 0.64 + m, py + m, Math.max(1, cell * 0.06), tam);
        g.fillStyle = '#2c7a1e';
        g.fillRect(px + cell * 0.42, py + cell * 0.04, cell * 0.14, cell * 0.16);
        g.shadowBlur = cell * (0.2 + maldita * 0.45);
        g.shadowColor = '#a040ff';
        g.fillStyle = `rgb(${120 + (maldita * 40 | 0)}, 30, ${180 + (maldita * 60 | 0)})`;
        g.beginPath();
        g.moveTo(px + cell * 0.22, py + cell * 0.4);
        g.lineTo(px + cell * 0.4, py + cell * 0.4);
        g.lineTo(px + cell * 0.31, py + cell * 0.26);
        g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(px + cell * 0.6, py + cell * 0.4);
        g.lineTo(px + cell * 0.78, py + cell * 0.4);
        g.lineTo(px + cell * 0.69, py + cell * 0.26);
        g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(px + cell * 0.24, py + cell * 0.58);
        g.lineTo(px + cell * 0.34, py + cell * 0.74);
        g.lineTo(px + cell * 0.44, py + cell * 0.58);
        g.lineTo(px + cell * 0.54, py + cell * 0.74);
        g.lineTo(px + cell * 0.64, py + cell * 0.58);
        g.lineTo(px + cell * 0.76, py + cell * 0.74);
        g.lineTo(px + cell * 0.76, py + cell * 0.6);
        g.lineTo(px + cell * 0.24, py + cell * 0.6);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(90, 30, 0, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else if (skin === 'Natalina') {
        /* Natalina: noite de Natal viva — neve caindo,
           pisca-pisca colorido alternando e estrela dourada
           brilhando no topo a cada 6 peças. */
        const noiteN = g.createLinearGradient(px, py, px, py + cell);
        noiteN.addColorStop(0, '#0c6e34');
        noiteN.addColorStop(1, '#084421');
        g.fillStyle = noiteN;
        g.fillRect(px + m, py + m, tam, tam);
        for (let f = 0; f < 2; f++) {
            const faseN = (Date.now() / 1100 + i * 0.4 + f * 0.5) % 1;
            const nx = px + cell * (0.2 + ((i * 13 + f * 37) % 60) / 100);
            const ny = py + cell * (0.1 + faseN * 0.85);
            g.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - faseN * 0.4)})`;
            g.beginPath();
            g.arc(nx, ny, Math.max(1, cell * 0.045 * (1 - faseN * 0.3)), 0, Math.PI * 2);
            g.fill();
        }
        if (i % 6 === 0) {
            const brilhoN = Math.sin(Date.now() / 250) * 0.5 + 0.5;
            g.shadowBlur = cell * (0.2 + brilhoN * 0.4);
            g.shadowColor = '#ffd75a';
            g.fillStyle = brilhoN > 0.5 ? '#ffe89a' : '#e8b23a';
            const cxN = px + cell * 0.5, cyN = py + cell * 0.42, rN = cell * 0.17;
            g.beginPath();
            for (let pN = 0; pN < 10; pN++) {
                const angN = -Math.PI / 2 + pN * Math.PI / 5;
                const raioN = pN % 2 === 0 ? rN : rN * 0.45;
                const xN = cxN + Math.cos(angN) * raioN;
                const yN = cyN + Math.sin(angN) * raioN;
                if (pN === 0) g.moveTo(xN, yN);
                else g.lineTo(xN, yN);
            }
            g.closePath();
            g.fill();
            g.shadowBlur = 0;
        } else {
            const coresLuz = ['#ff3b3b', '#ffe14d', '#4da6ff', '#5aff7a'];
            const acesaN = (Math.floor(Date.now() / 350) + i) % 2;
            for (let l = 0; l < 2; l++) {
                const corL = coresLuz[(i + l * 2) % 4];
                const ligada = acesaN === l;
                g.fillStyle = ligada ? corL : 'rgba(255, 255, 255, 0.18)';
                if (ligada) { g.shadowBlur = cell * 0.4; g.shadowColor = corL; }
                g.fillRect(px + cell * (0.22 + l * 0.4), py + cell * (l % 2 ? 0.3 : 0.62), cell * 0.16, cell * 0.16);
                g.shadowBlur = 0;
            }
        }
        g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        g.lineWidth = Math.max(1, cell * 0.04);
        g.strokeRect(px + m, py + m, tam, tam);

    } else {
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);
    }
}

/* =========================================================
   APLICAR TEMA
========================================================= */
function apply() {
    const t = T[theme];
    document.documentElement.style.setProperty('--bg', col(t[0]));
    document.documentElement.style.setProperty('--c2', col(t[2]));
    document.documentElement.style.setProperty('--border', col(t[3]));
    document.documentElement.style.setProperty('--text', '#fff');
    $('dh').textContent = diff;
}
apply();

function resize() {
    const r = cv.getBoundingClientRect();
    const d = Math.min(devicePixelRatio || 1, 2);
    cv.width = r.width * d;
    cv.height = r.height * d;
    ctx.setTransform(d, 0, 0, d, 0, 0);
}
function getMapArea() {
    const r = cv.getBoundingClientRect();
    const menor = Math.min(r.width, r.height);
    const tamanho = menor * MAPA_TAMANHO_TELA;
    const cell = tamanho / mapSize;
    return { cell, size: tamanho, x: (r.width - tamanho) / 2, y: (r.height - tamanho) / 2 };
}
window.onresize = () => { resize(); draw(); };

function rnd() {
    const margem = 3;
    return {
        x: Math.floor(margem + Math.random() * (mapSize - margem * 2)),
        y: Math.floor(margem + Math.random() * (mapSize - margem * 2))
    };
}
function formatarTempo(segundos) {
    const s = Math.max(0, Math.floor(segundos || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
}
function obsKey(x, y) { return x + ',' + y; }
function isObstacle(p) { return obstacles.has(obsKey(p.x, p.y)); }
function normalizarCelula(c) {
    if (mapMode !== 'SemParede') return c;
    let x = c.x, y = c.y;
    if (x < 0) x = mapSize - 1;
    if (x >= mapSize) x = 0;
    if (y < 0) y = mapSize - 1;
    if (y >= mapSize) y = 0;
    return { x, y };
}
function celulasOcupadasPorSegmento(p) {
    const escala = escalaAtual();
    const base = [];
    for (let dx = 0; dx < escala; dx++) {
        for (let dy = 0; dy < escala; dy++) { base.push({ x: p.x + dx, y: p.y + dy }); }
    }
    return base.map(normalizarCelula);
}
function occupied(p) {
    return s.some(q => celulasOcupadasPorSegmento(q).some(c => c.x === p.x && c.y === p.y)) ||
        isObstacle(p) ||
        foods.some(f => f.x === p.x && f.y === p.y) ||
        (rgbOn && rgb && rgb.x === p.x && rgb.y === p.y);
}

function ajustarObstaculos() {
    obstacles.forEach(chave => {
        const [ox, oy] = chave.split(',').map(Number);
        if (ox >= mapSize || oy >= mapSize) obstacles.delete(chave);
    });
    const centro = Math.floor(mapSize / 2);
    const qtdAlvo = Math.floor(mapSize * mapSize * 0.0125);
    let tentativas = 0;
    while (obstacles.size < qtdAlvo && tentativas < 500) {
        tentativas++;
        const p = rnd();
        if (Math.abs(p.x - centro) < 4 && Math.abs(p.y - centro) < 4) continue;
        if (occupied(p)) continue;
        obstacles.add(obsKey(p.x, p.y));
    }
}
function prepararModoMapa() { if (mapMode === 'Obstaculos') ajustarObstaculos(); }

function velocidadeAtual() {
    const base = D[diff][0];
    /* [v36] sistema de nível 5% mais devagar: 1.4 -> 1.33 e 0.8 -> 0.76 */
    const fatorNivel = (mapMode === 'Velocidade') ? 1.33 : 0.76;
    let bonus = (level - 1) * fatorNivel;
    bonus += velocidadeExtraApple;
    if (efeitoTemporario && efeitoTemporario.tipo === 'velocidade' && gameTime < efeitoTemporario.ate) bonus += 6;
    let resultado = Math.min(base + bonus, base + 18);
    /* [v36] cada fase da história tem seu próprio ritmo */
    if (historiaAtiva && historiaVelocidadeMult) resultado *= historiaVelocidadeMult;
    const dv = devVal('velocidade');
    if (dv) resultado *= dv;
    return resultado;
}

function agendarProximoEventoCaos() { proximoEventoCaos = gameTime + 15 + Math.random() * 10; }
function dispararEventoCaos() {
    const eventos = ['velocidade', 'macaFugitiva', 'espelho'];
    const tipo = eventos[Math.floor(Math.random() * eventos.length)];
    if (tipo === 'velocidade') {
        efeitoTemporario = { tipo: 'velocidade', ate: gameTime + 4 };
        mensagemEvento = '⚡ Rajada de velocidade!';
    } else if (tipo === 'macaFugitiva') {
        if (foods.length) {
            const idx = Math.floor(Math.random() * foods.length);
            const nova = spawnUmaMaca();
            if (nova) foods[idx] = nova;
        }
        mensagemEvento = '🍎 Maçã fugitiva!';
    } else if (tipo === 'espelho') {
        efeitoTemporario = { tipo: 'espelho', ate: gameTime + 4 };
        mensagemEvento = '🔀 Controles invertidos!';
    }
    mensagemEventoAte = gameTime + 2.5;
    agendarProximoEventoCaos();
}
function direcaoAtiva(d) {
    const espelhoAtivo = mapMode === 'Espelho' ||
        (efeitoTemporario && efeitoTemporario.tipo === 'espelho' && gameTime < efeitoTemporario.ate);
    if (!espelhoAtivo) return d;
    const inverso = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    return inverso[d];
}

function spawnUmaMaca() {
    let tentativas = 0, p;
    do {
        p = rnd();
        tentativas++;
        if (tentativas > 1000) return null;
    } while (occupied(p));
    return p;
}
function preencherMacas() {
    const alvo = quantidadeMacas();
    while (foods.length < alvo) {
        const p = spawnUmaMaca();
        if (!p) { if (run) end(); return; }
        foods.push(p);
    }
    if (foods.length > alvo) foods.length = alvo;
}
function spawnRgb() {
    const p = spawnUmaMaca();
    if (!p) { rgbOn = false; rgb = null; return; }
    rgb = p;
}

function reset() {
    mapSize = devVal('mapa') || ((historiaAtiva && historiaMapaInicial) ? historiaMapaInicial : MAPA_INICIAL);
    mapaInicialAtual = mapSize;
    const c = Math.floor(mapSize / 2), r = Math.floor(mapSize / 2);
    const escala = escalaAtual();
    s = [{ x: c, y: r }, { x: c - escala, y: r }, { x: c - escala * 2, y: r }];
    prevS = s.map(seg => ({ ...seg }));
    dir = 'RIGHT';
    next = 'RIGHT';
    grow = 0;
    score = 0;
    coinsThisRun = 0;
    color = C[Math.floor(Math.random() * C.length)];
    rgbOn = false;
    rgb = null;
    nextRgbScore = 20;
    gameTime = 0;
    totalPaused = 0;
    pausedAt = 0;
    level = 1;
    velocidadeExtraApple = 0;
    efeitoTemporario = null;
    mensagemEvento = '';
    mensagemEventoAte = 0;
    proximoEventoCaos = 15 + Math.random() * 10;
    start = performance.now();
    lastMove = start;
    obstacles = new Set();
    foods = [];
    prepararModoMapa();
    preencherMacas();
}

function setDir(d) {
    const opposite = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    if (opposite[dir] !== d) next = d;
}
window.onkeydown = e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') setDir(direcaoAtiva('UP'));
    if (k === 'arrowdown' || k === 's') setDir(direcaoAtiva('DOWN'));
    if (k === 'arrowleft' || k === 'a') setDir(direcaoAtiva('LEFT'));
    if (k === 'arrowright' || k === 'd') setDir(direcaoAtiva('RIGHT'));
    if (k === 'escape') togglePause();
};

let sx = 0, sy = 0;
let swipeAtivo = false;
cv.ontouchstart = e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; swipeAtivo = false; };
cv.ontouchmove = e => {
    e.preventDefault();
    if (swipeAtivo) return;
    const x = e.touches[0].clientX - sx;
    const y = e.touches[0].clientY - sy;
    if (Math.max(Math.abs(x), Math.abs(y)) < 20) return;
    if (Math.abs(x) > Math.abs(y)) setDir(direcaoAtiva(x > 0 ? 'RIGHT' : 'LEFT'));
    else setDir(direcaoAtiva(y > 0 ? 'DOWN' : 'UP'));
    swipeAtivo = true;
};
cv.ontouchend = e => { e.preventDefault(); swipeAtivo = false; };
function configurarDpad() {
    const botoes = [
        { id: 'dpadUp', direcao: 'UP' }, { id: 'dpadDown', direcao: 'DOWN' },
        { id: 'dpadLeft', direcao: 'LEFT' }, { id: 'dpadRight', direcao: 'RIGHT' }
    ];
    botoes.forEach(b => {
        const btn = $(b.id);
        if (!btn) return;
        const acionar = e => { e.preventDefault(); setDir(direcaoAtiva(b.direcao)); };
        btn.addEventListener('pointerdown', acionar);
    });
}
configurarDpad();

function shrinkMap() {
    if (mapSize <= MAPA_MINIMO) return;
    mapSize -= 2;
    prepararModoMapa();
    foods = foods.filter(f => f.x < mapSize && f.y < mapSize && !isObstacle(f));
    preencherMacas();
    if (rgbOn && rgb && (rgb.x >= mapSize || rgb.y >= mapSize || isObstacle(rgb))) spawnRgb();
}

function move() {
    prevS = s.map(seg => ({ ...seg }));
    dir = next;
    const escala = escalaAtual();
    const h = { ...s[0] };
    if (dir === 'UP') h.y--;
    if (dir === 'DOWN') h.y++;
    if (dir === 'LEFT') h.x--;
    if (dir === 'RIGHT') h.x++;

    if (mapMode === 'SemParede') {
        if (h.x < 0) h.x = mapSize - 1;
        if (h.x >= mapSize) h.x = 0;
        if (h.y < 0) h.y = mapSize - 1;
        if (h.y >= mapSize) h.y = 0;
    } else {
        const foraDosLimites = celulasOcupadasPorSegmento(h).some(c => c.x < 0 || c.x >= mapSize || c.y < 0 || c.y >= mapSize);
        if (foraDosLimites) { end(); return; }
    }

    const celulasHead = celulasOcupadasPorSegmento(h);
    const colidiuObstaculo = celulasHead.some(c => isObstacle(c));
    const ignoraAte = escala > 1 ? escala * 2 : 0;
    const colidiuCorpo = s.some((p, i) => {
        if (i === 0) return false;
        if (escala > 1 && i <= ignoraAte) return false;
        const celulasCorpo = celulasOcupadasPorSegmento(p);
        return celulasCorpo.some(bc => celulasHead.some(hc => hc.x === bc.x && hc.y === bc.y));
    });
    if (colidiuObstaculo || colidiuCorpo) { end(); return; }

    s.unshift(h);

    const idxComida = foods.findIndex(f => celulasHead.some(c => c.x === f.x && c.y === f.y));
    if (idxComida !== -1) {
        const ptsBase = D[diff][1] * MULTIPLICADOR_MACA;
        score += devVal('valorMaca') ?? ptsBase;
        grow += devVal('crescimento') ?? ptsBase;
        coinsThisRun += devVal('moedasMaca') ?? 2;
        color = C[Math.floor(Math.random() * C.length)];
        if (mapMode === 'Velocidade') velocidadeExtraApple = Math.min(velocidadeExtraApple + 0.3, 10);
        foods.splice(idxComida, 1);
        preencherMacas();
        if (!rgbOn && score >= nextRgbScore) { rgbOn = true; spawnRgb(); nextRgbScore += 10; }
        if (historiaAtiva) historiaMacasComidas++;
    }

    if (rgbOn && rgb && celulasHead.some(c => c.x === rgb.x && c.y === rgb.y)) {
        const ptsBaseRgb = D[diff][1] * MULTIPLICADOR_MACA;
        const multRgb = devVal('multRgb') ?? 5;
        score += Math.round(multRgb * (devVal('valorMaca') ?? ptsBaseRgb));
        grow += Math.min(500, Math.round(multRgb * (devVal('crescimento') ?? ptsBaseRgb)));
        coinsThisRun += devVal('moedasRgb') ?? 4;
        color = C[Math.floor(Math.random() * C.length)];
        rgbOn = false;
        rgb = null;
        if (foods.length) {
            const idxRealoca = Math.floor(Math.random() * foods.length);
            const novaPos = spawnUmaMaca();
            if (novaPos) foods[idxRealoca] = novaPos;
        }
    }

    if (grow > 0) grow--; else s.pop();
}

/* =========================================================
   DESENHAR MAÇÃ
========================================================= */
function desenharMaca(gM, mx, my, cellM, tempoM, semGlow, hueM) {
    const pulsoM = Math.sin(tempoM / 320 + (mx + my) * 0.35) * 0.5 + 0.5;
    const cxa = mx + cellM / 2;
    const cya = my + cellM * 0.56;
    const raio = cellM * (0.29 + pulsoM * 0.025);
    const eRgb = typeof hueM === 'number';
    const hue = eRgb ? hueM : 0;
    const brilhoM = gM.createRadialGradient(cxa - raio * 0.3, cya - raio * 0.35, raio * 0.15, cxa, cya, raio * 1.15);
    if (eRgb) {
        brilhoM.addColorStop(0, `hsl(${hue}, 95%, 68%)`);
        brilhoM.addColorStop(0.45, `hsl(${hue}, 85%, 50%)`);
        brilhoM.addColorStop(1, `hsl(${(hue + 40) % 360}, 80%, 28%)`);
    } else {
        brilhoM.addColorStop(0, '#ff6b5e');
        brilhoM.addColorStop(0.45, '#e8262f');
        brilhoM.addColorStop(1, '#9c0f18');
    }
    gM.fillStyle = brilhoM;
    gM.beginPath();
    gM.arc(cxa, cya, raio, 0, Math.PI * 2);
    gM.fill();
    gM.fillStyle = eRgb ? `hsla(${(hue + 60) % 360}, 100%, 88%, .5)` : 'rgba(255, 255, 255, .48)';
    gM.beginPath();
    gM.ellipse(cxa - raio * 0.34, cya - raio * 0.32, raio * 0.24, raio * 0.15, -0.6, 0, Math.PI * 2);
    gM.fill();
    if (semGlow) return;
    gM.strokeStyle = eRgb ? `hsl(${(hue + 20) % 360}, 60%, 25%)` : '#5c3a12';
    gM.lineWidth = Math.max(1, cellM * 0.05);
    gM.lineCap = 'round';
    gM.beginPath();
    gM.moveTo(cxa, cya - raio * 0.82);
    gM.quadraticCurveTo(cxa + raio * 0.08, cya - raio * 1.15, cxa + raio * 0.22, cya - raio * 1.28);
    gM.stroke();
    gM.lineCap = 'butt';
    gM.fillStyle = eRgb ? `hsl(${(hue + 90) % 360}, 65%, 35%)` : '#3f8c1e';
    gM.beginPath();
    gM.ellipse(cxa + raio * 0.52, cya - raio * 1.1, raio * 0.4, raio * 0.18, -0.5, 0, Math.PI * 2);
    gM.fill();
}

/* =========================================================
   CENÁRIOS ANIMADOS DOS TEMAS

   O fundo estático de cada tema (montanhas, silhuetas,
   gradientes, luzes) é desenhado UMA vez em um canvas
   invisível e colado por drawImage a cada quadro. Por
   cima passam só as partículas animadas (chuva, brasas,
   pétalas...). Cenário rico sem pesar no celular.
========================================================= */
/* =========================================================
   CENÁRIO ANIMADO DO TEMA (apenas Cosmos)

   [v36] Os outros 5 cenários animados (Abismo, Vulcão,
   Tempestade, Retrô, Sakura) foram removidos — só o Cosmos
   ficou, com fundo estático cacheado + elementos animados.
========================================================= */

/* Cenário do tema Cosmos: nebulosas, estrelas titilando,
   buraco negro com disco de acreção girando e um planeta
   distante com anel — tudo animado atrás da partida.
   Os gradientes caros são criados UMA vez (cache) e
   reutilizados a cada quadro. */
let cosmosCache = { chave: '', nebulosas: [], halo: null, nucleo: null, esfera: null, galaxias: [], bhx: 0, bhy: 0, raioB: 0, plx: 0, ply: 0, raioP: 0 };
function desenharCosmos(area, cell) {
    const agora = Date.now();
    const rnd = n => {
        const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    };
    const chave = [Math.round(area.x), Math.round(area.y), Math.round(area.size), Math.round(cell)].join('|');
    if (cosmosCache.chave !== chave) {
        cosmosCache = { chave, nebulosas: [], halo: null, nucleo: null, esfera: null, galaxias: [], bhx: 0, bhy: 0, raioB: 0, plx: 0, ply: 0, raioP: 0 };
        cosmosCache.nebulosas = [[0.28, 0.6, [120, 60, 220], 0.16, 0.36],
         [0.78, 0.22, [60, 110, 230], 0.15, 0.3],
         [0.55, 0.85, [200, 70, 160], 0.12, 0.26],
         [0.12, 0.18, [40, 190, 180], 0.11, 0.2],
         [0.9, 0.55, [90, 60, 200], 0.12, 0.24],
         [0.4, 0.4, [160, 100, 255], 0.09, 0.3]].map(nb => {
            const nx = area.x + area.size * nb[0];
            const ny = area.y + area.size * nb[1];
            const nr = area.size * nb[4];
            const neb = ctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
            neb.addColorStop(0, `rgba(${nb[2][0]}, ${nb[2][1]}, ${nb[2][2]}, ${nb[3]})`);
            neb.addColorStop(1, 'rgba(0, 0, 0, 0)');
            return { grad: neb, x: nx, y: ny, r: nr };
        });
        cosmosCache.bhx = area.x + area.size * (0.2 + rnd(7) * 0.12);
        cosmosCache.bhy = area.y + area.size * (0.3 + rnd(17) * 0.12);
        cosmosCache.raioB = cell * 2.6;
        const haloB = ctx.createRadialGradient(cosmosCache.bhx, cosmosCache.bhy, cosmosCache.raioB, cosmosCache.bhx, cosmosCache.bhy, cosmosCache.raioB * 2.6);
        haloB.addColorStop(0, 'rgba(120, 80, 255, .18)');
        haloB.addColorStop(0.5, 'rgba(60, 30, 140, .08)');
        haloB.addColorStop(1, 'rgba(0, 0, 0, 0)');
        cosmosCache.halo = haloB;
        const nucleo = ctx.createRadialGradient(cosmosCache.bhx, cosmosCache.bhy, cosmosCache.raioB * 0.15, cosmosCache.bhx, cosmosCache.bhy, cosmosCache.raioB);
        nucleo.addColorStop(0, 'rgba(0, 0, 0, 1)');
        nucleo.addColorStop(0.72, 'rgba(2, 0, 10, .96)');
        nucleo.addColorStop(1, 'rgba(20, 8, 50, 0)');
        cosmosCache.nucleo = nucleo;
        cosmosCache.plx = area.x + area.size * 0.8;
        cosmosCache.ply = area.y + area.size * 0.74;
        cosmosCache.raioP = cell * 1.5;
        const esfera = ctx.createRadialGradient(cosmosCache.plx - cosmosCache.raioP * 0.35, cosmosCache.ply - cosmosCache.raioP * 0.35, cosmosCache.raioP * 0.15, cosmosCache.plx, cosmosCache.ply, cosmosCache.raioP);
        esfera.addColorStop(0, '#7ab8ff');
        esfera.addColorStop(0.6, '#2c4a9e');
        esfera.addColorStop(1, '#101a3c');
        cosmosCache.esfera = esfera;
        cosmosCache.galaxias = [0, 1, 2].map(gal => {
            const rgG = cell * (1.1 + gal * 0.4);
            const nucleoG = ctx.createRadialGradient(0, 0, 0, 0, 0, rgG * 0.35);
            nucleoG.addColorStop(0, 'rgba(255, 245, 220, .5)');
            nucleoG.addColorStop(1, 'rgba(255, 245, 220, 0)');
            return nucleoG;
        });
    }
    const C = cosmosCache;
    C.nebulosas.forEach((nb, idxN) => {
        const respira = 1 + Math.sin(agora / 4200 + idxN * 2.1);
        ctx.globalAlpha = 0.75 + respira * 0.12;
        ctx.fillStyle = nb.grad;
        ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    });
    ctx.globalAlpha = 1;
    for (let st = 0; st < 50; st++) {
        const xs = area.x + rnd(st + 1) * (area.size - cell * 2) + cell;
        const ys = area.y + rnd(st + 51) * (area.size - cell * 2) + cell;
        const tit = Math.sin(agora / (250 + (st % 5) * 90) + st * 2.4) * 0.5 + 0.5;
        const classe = st % 9;
        const tam = Math.max(1, cell * (classe === 0 ? 0.15 : classe < 3 ? 0.11 : 0.07));
        const corE = classe === 0 ? `rgba(200, 220, 255, ${0.35 + tit * 0.6})`
            : classe === 3 ? `rgba(255, 230, 190, ${0.3 + tit * 0.55})`
            : `rgba(255, 255, 255, ${0.18 + tit * 0.55})`;
        ctx.fillStyle = corE;
        ctx.fillRect(xs, ys, tam, tam);
        if (classe === 0) {
            ctx.fillStyle = `rgba(200, 220, 255, ${0.12 + tit * 0.15})`;
            ctx.fillRect(xs - tam * 0.9, ys + tam * 0.3, tam * 2.8, tam * 0.4);
            ctx.fillRect(xs + tam * 0.3, ys - tam * 0.9, tam * 0.4, tam * 2.8);
        }
    }
    for (let gal = 0; gal < 3; gal++) {
        const gx = area.x + area.size * (0.1 + rnd(gal * 13 + 700) * 0.8);
        const gy = area.y + area.size * (0.1 + rnd(gal * 13 + 800) * 0.8);
        const rg = cell * (1.1 + gal * 0.4);
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(agora / (16000 + gal * 7000));
        for (let braco = 0; braco < 2; braco++) {
            ctx.strokeStyle = `rgba(${170 + braco * 40}, ${180 + braco * 20}, 255, .22)`;
            ctx.lineWidth = Math.max(1, cell * 0.07);
            ctx.beginPath();
            for (let espir = 0; espir <= 10; espir++) {
                const angE = espir / 10 * Math.PI * 1.4 + braco * Math.PI;
                const raioE = rg * espir / 10;
                const px2 = Math.cos(angE) * raioE;
                const py2 = Math.sin(angE) * raioE * 0.55;
                if (espir === 0) ctx.moveTo(px2, py2);
                else ctx.lineTo(px2, py2);
            }
            ctx.stroke();
        }
        ctx.fillStyle = C.galaxias[gal];
        ctx.beginPath();
        ctx.arc(0, 0, rg * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    for (let cons = 0; cons < 3; cons++) {
        const baseX = area.x + area.size * (0.14 + rnd(cons * 9 + 90) * 0.68);
        const baseY = area.y + area.size * (0.14 + rnd(cons * 9 + 130) * 0.6);
        const escalaC = cell * 2.6;
        const pontos = [];
        for (let pt = 0; pt < 5; pt++) {
            pontos.push([
                baseX + (rnd(cons * 31 + pt * 7 + 200) - 0.5) * escalaC * 3,
                baseY + (rnd(cons * 31 + pt * 7 + 300) - 0.5) * escalaC * 3
            ]);
        }
        const faseC = Math.floor((agora / 1000 + cons * 3) % 9);
        ctx.lineWidth = Math.max(1, cell * 0.035);
        for (let seg = 0; seg < 4; seg++) {
            const acesaSeg = faseC > seg;
            ctx.strokeStyle = `rgba(190, 210, 255, ${acesaSeg ? 0.4 : 0.08})`;
            ctx.beginPath();
            ctx.moveTo(pontos[seg][0], pontos[seg][1]);
            ctx.lineTo(pontos[seg + 1][0], pontos[seg + 1][1]);
            ctx.stroke();
        }
        pontos.forEach((ptC, idxC) => {
            const acesaPt = faseC > idxC;
            const titC = Math.sin(agora / 300 + idxC * 3 + cons) * 0.5 + 0.5;
            ctx.fillStyle = `rgba(230, 240, 255, ${acesaPt ? 0.55 + titC * 0.45 : 0.2 + titC * 0.15})`;
            const tamC = Math.max(1.5, cell * (acesaPt ? 0.1 : 0.07));
            ctx.fillRect(ptC[0] - tamC / 2, ptC[1] - tamC / 2, tamC, tamC);
        });
    }
    const ciclo = Math.floor(agora / 9000);
    const prog = (agora % 9000) / 950;
    if (prog < 1) {
        const inicioX = area.x + area.size * (0.08 + rnd(ciclo * 3 + 400) * 0.6);
        const inicioY = area.y + area.size * (0.06 + rnd(ciclo * 3 + 500) * 0.35);
        const vel = area.size * 0.3;
        const cxS = inicioX + vel * prog;
        const cyS = inicioY + vel * prog * 0.55;
        const caudaS = vel * 0.16;
        const rastro = ctx.createLinearGradient(cxS - caudaS, cyS - caudaS * 0.55, cxS, cyS);
        rastro.addColorStop(0, 'rgba(255, 255, 255, 0)');
        rastro.addColorStop(1, 'rgba(210, 235, 255, .9)');
        ctx.strokeStyle = rastro;
        ctx.lineWidth = Math.max(1, cell * 0.06);
        ctx.beginPath();
        ctx.moveTo(cxS - caudaS, cyS - caudaS * 0.55);
        ctx.lineTo(cxS, cyS);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cxS - cell * 0.04, cyS - cell * 0.04, Math.max(1.5, cell * 0.08), Math.max(1.5, cell * 0.08));
    }
    const angCom = agora / 22000;
    const ccx = area.x + area.size / 2;
    const ccy = area.y + area.size / 2;
    const raioOrbX = area.size * 0.4;
    const raioOrbY = area.size * 0.32;
    for (let k = 6; k >= 0; k--) {
        const angK = angCom - k * 0.035;
        const cxK = ccx + Math.cos(angK) * raioOrbX;
        const cyK = ccy + Math.sin(angK) * raioOrbY;
        ctx.fillStyle = `rgba(150, 210, 255, ${0.5 * (1 - k / 7)})`;
        ctx.beginPath();
        ctx.arc(cxK, cyK, Math.max(1, cell * (k === 0 ? 0.13 : 0.1 - k * 0.012)), 0, Math.PI * 2);
        ctx.fill();
    }
    const bhx = C.bhx, bhy = C.bhy, raioB = C.raioB;
    ctx.fillStyle = C.halo;
    ctx.fillRect(bhx - raioB * 2.6, bhy - raioB * 2.6, raioB * 5.2, raioB * 5.2);
    ctx.save();
    ctx.translate(bhx, bhy);
    ctx.rotate(agora / 2600);
    for (let anel = 0; anel < 3; anel++) {
        ctx.strokeStyle = anel === 0
            ? 'rgba(255, 170, 70, .85)'
            : anel === 1
                ? 'rgba(210, 130, 255, .6)'
                : 'rgba(130, 170, 255, .38)';
        ctx.lineWidth = Math.max(1, cell * (0.15 - anel * 0.04));
        ctx.beginPath();
        ctx.ellipse(0, 0, raioB * (1.05 + anel * 0.4), raioB * (0.42 + anel * 0.2), 0.35, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = C.nucleo;
    ctx.beginPath();
    ctx.arc(bhx, bhy, raioB, 0, Math.PI * 2);
    ctx.fill();
    const plx = C.plx, ply = C.ply, raioP = C.raioP;
    ctx.fillStyle = C.esfera;
    ctx.beginPath();
    ctx.arc(plx, ply, raioP, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(plx, ply);
    ctx.rotate(-0.4 + Math.sin(agora / 5000) * 0.08);
    [[1.55, 'rgba(255, 210, 150, .6)', cell * 0.1], [1.85, 'rgba(200, 170, 255, .4)', cell * 0.07]].forEach(rg => {
        ctx.strokeStyle = rg[1];
        ctx.lineWidth = Math.max(1, rg[2]);
        ctx.beginPath();
        ctx.ellipse(0, 0, raioP * rg[0], raioP * rg[0] * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
    ctx.restore();
    for (let lua = 0; lua < 2; lua++) {
        const angL = agora / (2600 + lua * 1700) + lua * 2.6;
        const lxL = plx + Math.cos(angL) * raioP * (2.2 + lua * 0.5);
        const lyL = ply + Math.sin(angL) * raioP * (2.2 + lua * 0.5) * 0.45;
        ctx.fillStyle = lua === 0 ? 'rgba(220, 225, 240, .9)' : 'rgba(200, 180, 220, .8)';
        ctx.beginPath();
        ctx.arc(lxL, lyL, Math.max(1.5, cell * (lua === 0 ? 0.14 : 0.1)), 0, Math.PI * 2);
        ctx.fill();
    }
}

function draw() {
    const r = cv.getBoundingClientRect();
    const t = T[theme];
    const area = getMapArea();
    const cell = area.cell;
    const intervaloAtual = 1000 / velocidadeAtual();
    const tLerp = (paused || !run) ? 1 : Math.min(1, (performance.now() - lastMove) / intervaloAtual);

    ctx.clearRect(0, 0, r.width, r.height);
    ctx.fillStyle = col(t[0]);
    ctx.fillRect(0, 0, r.width, r.height);

    for (let y = 0; y < mapSize; y++) {
        for (let x = 0; x < mapSize; x++) {
            ctx.fillStyle = (x + y) % 2 ? col(t[2]) : col(t[1]);
            ctx.fillRect(area.x + x * cell, area.y + y * cell, Math.ceil(cell) + 1, Math.ceil(cell) + 1);
        }
    }

    ctx.strokeStyle = col(t[3]);
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.strokeRect(area.x + 1, area.y + 1, area.size - 2, area.size - 2);

    if (area.size > 0 && cell > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        try {
            if (theme === 'Cosmos') desenharCosmos(area, cell, Date.now());
        } catch (_e) { console.warn('Erro no cenário:', _e); }
        ctx.restore();
    }

    if (obstacles.size) {
        obstacles.forEach(key => {
            const [ox, oy] = key.split(',').map(Number);
            const obsX = area.x + ox * cell, obsY = area.y + oy * cell;
            const obsT = Math.ceil(cell) + 1;
            ctx.fillStyle = '#000000';
            ctx.fillRect(obsX, obsY, obsT, obsT);
            ctx.fillStyle = 'rgba(255, 255, 255, .16)';
            ctx.fillRect(obsX, obsY, obsT, Math.max(1, cell * 0.14));
        });
    }

    foods.forEach(f => { desenharMaca(ctx, area.x + f.x * cell, area.y + f.y * cell, cell, performance.now()); });

    if (rgbOn && rgb) {
        desenharMaca(ctx, area.x + rgb.x * cell, area.y + rgb.y * cell, cell, performance.now(), false, (performance.now() / 6) % 360);
    }

    const LIMITE_DETALHE = 20;
    s.forEach((p, i) => {
        const src = (i === 0) ? prevS[0] : prevS[i - 1];
        let gx = p.x, gy = p.y;
        if (src) {
            let dx = p.x - src.x, dy = p.y - src.y;
            if (dx > mapSize / 2) dx -= mapSize; else if (dx < -mapSize / 2) dx += mapSize;
            if (dy > mapSize / 2) dy -= mapSize; else if (dy < -mapSize / 2) dy += mapSize;
            gx = src.x + dx * tLerp;
            gy = src.y + dy * tLerp;
        }
        const px = area.x + gx * cell;
        const py = area.y + gy * cell;
        const celulaDesenho = cell * escalaAtual();
        ctx.save();
        desenharSegmento(px, py, celulaDesenho, i, s.length, ctx, i > LIMITE_DETALHE);
        ctx.restore();
        if (i === 0) {
            ctx.fillStyle = '#111';
            const olho = Math.max(2, celulaDesenho * 0.13);
            ctx.fillRect(px + celulaDesenho * 0.25, py + celulaDesenho * 0.25, olho, olho);
            ctx.fillRect(px + celulaDesenho * 0.65, py + celulaDesenho * 0.25, olho, olho);
        }
    });
    if (historiaAtiva) desenharInimigosHistoria(area, cell);
}

function hud() {
    $('score').textContent = score;
    if (mapMode === 'Tempo') $('time').textContent = Math.max(0, Math.ceil(LIMITE_TEMPO_MODO - gameTime)) + 's';
    else $('time').textContent = Math.floor(gameTime) + 's';
    $('lvl').textContent = 'Nível ' + level;
    if (mapMode === 'Caos' && gameTime < mensagemEventoAte) {
        $('toastEvento').textContent = mensagemEvento;
        $('toastEvento').classList.remove('hide');
    } else {
        $('toastEvento').classList.add('hide');
    }
    const label = document.querySelector('#wrap label');
    if (label) label.textContent = `MAPA ${mapSize}×${mapSize} · ${MAPMODE_LABEL[mapMode]}${devAtivo() ? ' · 🛠 DEV' : ''}`;
}

function loop(now) {
    if (!run) return;
    if (!paused) {
        gameTime = (now - start - totalPaused) / 1000;
        if (gameTime < 0) gameTime = 0;
        const novoNivel = 1 + Math.floor(gameTime / 20);
        if (novoNivel !== level) level = novoNivel;
        if (mapMode === 'Tempo' && gameTime >= LIMITE_TEMPO_MODO) { end(); return; }
        if (mapMode === 'Caos' && gameTime >= proximoEventoCaos) dispararEventoCaos();
        const intervaloMovimento = 1000 / velocidadeAtual();
        if (now - lastMove >= intervaloMovimento) {
            lastMove += intervaloMovimento;
            move();
            if (historiaAtiva && historiaInimigos.length) {
                moverInimigosHistoria();
                verificarColisaoInimigosHistoria();
            }
        }
        if (modoEncolheMapa()) {
            const reducoes = Math.floor(gameTime / 60);
            const tamanhoEsperado = Math.max(MAPA_MINIMO, mapaInicialAtual - reducoes * 2);
            if (tamanhoEsperado < mapSize) shrinkMap();
        }
        if (historiaAtiva) verificarObjetivoHistoria();
        hud();
        draw();
    }
    requestAnimationFrame(loop);
}

const TELAS = ['home', 'ranking', 'game', 'menuSkins', 'historiaNiveis', 'historiaCutscene', 'historiaEpilogo', 'devPanel'];
function showScreen(id) { TELAS.forEach(s => $(s).classList.add('hide')); $(id).classList.remove('hide'); }
function atualizarStatusJogador() {
    if ($('homeCoins')) $('homeCoins').textContent = coins;
    if ($('homeLevel')) $('homeLevel').textContent = playerLevel();
}

function startRound() {
    reset();
    run = false;
    paused = false;
    const appEl = document.querySelector('.app');
    if (appEl) appEl.classList.add('semHeader');
    showScreen('game');
    resize();
    draw();
    iniciarContagemRegressiva();
}
function begin() {
    name = ($('name').value.trim().slice(0, 12)) || 'Jogador';
    $('name').value = name;
    localStorage.snakeName = name;
    startRound();
}

function iniciarContagemRegressiva() {
    let restante = 3;
    const elContagem = $('contagem');
    elContagem.textContent = restante;
    elContagem.classList.remove('hide');
    const intervalo = setInterval(() => {
        restante--;
        if (restante > 0) { elContagem.textContent = restante; return; }
        clearInterval(intervalo);
        elContagem.classList.add('hide');
        start = performance.now();
        totalPaused = 0;
        pausedAt = 0;
        const now = performance.now();
        lastMove = now;
        prevS = s.map(seg => ({ ...seg }));
        run = true;
        paused = false;
        requestAnimationFrame(loop);
    }, 1000);
}

function ensureOverlayInfo() {
    let el = document.getElementById('overlayInfo');
    if (!el) {
        el = document.createElement('p');
        el.id = 'overlayInfo';
        el.style.opacity = '0.85';
        el.style.margin = '-8px 0 18px';
        el.style.fontSize = '14px';
        document.querySelector('#overlay h2').insertAdjacentElement('afterend', el);
    }
    return el;
}
function showGameOverOverlay() {
    document.querySelector('#overlay h2').textContent = '💀 GAME OVER';
    ensureOverlayInfo().textContent = devAtivo()
        ? `${name}: ${score} pts · ${formatarTempo(gameTime)} · 🛠 dev: não conta no ranking`
        : `${name}: ${score} pts · ${formatarTempo(gameTime)} · +${coinsThisRun} 🪙`;
    $('cont').textContent = '🔁 JOGAR DE NOVO';
    $('reset').classList.add('hide');
    $('overlay').classList.remove('hide');
}
function resetOverlayParaPausa() {
    document.querySelector('#overlay h2').textContent = 'PAUSADO';
    const info = document.getElementById('overlayInfo');
    if (info) info.remove();
    $('cont').textContent = '▶ CONTINUAR';
    $('reset').classList.remove('hide');
}

function end() {
    if (!run) return;
    run = false;
    vibrar([120, 60, 140]);
    /* modo dev ativo = partida não oficial: sem moedas/XP/ranking */
    const oficial = !devAtivo();
    if (oficial) {
        coins += coinsThisRun;
        totalXP += score;
        localStorage.snakeCoins = coins;
        localStorage.snakeXP = totalXP;
    }

    if (historiaAtiva) {
        mostrarResultadoHistoria(false, HISTORIA_NIVEIS[historiaNivelAtual - 1]);
        return;
    }

    if (oficial) {
        rank.push({ name, score, time: Math.floor(gameTime), modo: mapMode, diff });
        rank.sort((a, b) => (b.score !== a.score) ? b.score - a.score : b.time - a.time);
        rank = rank.slice(0, 50);
        localStorage.snakeRank = JSON.stringify(rank);
        salvarRanking(name, score, Math.floor(gameTime), mapMode);
        salvarProgresso();
    }
    showGameOverOverlay();
}

function home() {
    run = false;
    paused = false;
    const appEl = document.querySelector('.app');
    if (appEl) appEl.classList.remove('semHeader');
    $('overlay').classList.add('hide');
    resetOverlayParaPausa();
    showScreen('home');
    atualizarStatusJogador();
}

let rankModoSelecionado = null;
function popularSeletorModoRanking() {
    const select = $('rankModoSelect');
    if (select.options.length === 0) {
        MAPMODES.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = MAPMODE_LABEL[m];
            select.appendChild(opt);
        });
    }
    if (!rankModoSelecionado) rankModoSelecionado = mapMode;
    select.value = rankModoSelecionado;
}
function renderRankingLocal() {
    const linhas = rank
        .filter(r => !r.modo || r.modo === rankModoSelecionado)
        .sort((a, b) => (b.score !== a.score) ? b.score - a.score : b.time - a.time)
        .slice(0, 10);
    if (!linhas.length) {
        $('scores').innerHTML = `<div class="row"><span>Nenhuma partida neste modo ainda.</span><b>—</b></div>`;
        return;
    }
    $('scores').innerHTML =
        `<div class="row"><span>📴 Ranking local (sem conexão com o global)</span><b></b></div>` +
        linhas.map((r, i) => {
            const safeName = String(r.name || 'Jogador').replace(/[<>&]/g, '');
            return `<div class="row rankRow"><span>${i + 1}. ${safeName}</span><b>${r.score} pts · ${formatarTempo(r.time)} · ${r.diff || ''}</b></div>`;
        }).join('');
}
async function carregarEExibirRanking() {
    $('scores').innerHTML = `<div class="row"><span>Carregando ranking...</span><b>...</b></div>`;
    const rankingGlobal = await carregarRanking(rankModoSelecionado);
    if (!rankingGlobal || !rankingGlobal.length) { renderRankingLocal(); return; }
    $('scores').innerHTML = rankingGlobal.map((r, i) => {
        const safeName = String(r.nome).replace(/[<>&]/g, '');
        const dificuldade = String(r.dificuldade || 'Normal').replace(/[<>&]/g, '');
        const tempoFormatado = formatarTempo(r.tempo);
        return `<div class="row rankRow"><span>${i + 1}. ${safeName}</span><b>${r.pontuacao} pts · ${tempoFormatado} · ${dificuldade}</b></div>`;
    }).join('');
}
async function showRank() { showScreen('ranking'); popularSeletorModoRanking(); await carregarEExibirRanking(); }
$('rankModoSelect').onchange = () => { rankModoSelecionado = $('rankModoSelect').value; carregarEExibirRanking(); };

function togglePause() {
    if (!run) return;
    if (!paused) {
        paused = true;
        pausedAt = performance.now();
        resetOverlayParaPausa();
        $('overlay').classList.remove('hide');
        return;
    }
    const agora = performance.now();
    totalPaused += agora - pausedAt;
    paused = false;
    lastMove = agora;
    $('overlay').classList.add('hide');
}

/* =========================================================
   MODO HISTÓRIA

   Contexto: uma tempestade cósmica varreu o ninho da
   cobrinha para longe. Guiada por um brilho distante, ela
   atravessa 20 terras diferentes até encontrar o caminho de
   volta pra casa, lá no fundo do Cosmos.

   Cada fase tem: tema visual, dificuldade, modo de mapa,
   um objetivo (comer X maçãs / alcançar X pontos / sobreviver
   X segundos) e uma cutscene simples antes de começar.
   O progresso do Modo História fica separado do progresso
   do modo arcade (nível/moedas continuam os mesmos, mas o
   avanço de fases é salvo à parte).
========================================================= */
const HISTORIA_NIVEIS = [
    { id: 1, nome: 'O Despertar', tema: 'Grama', dificuldade: 'Normal', modo: 'Classico', mapa: 55, velocidade: 0.9, objetivo: { tipo: 'macas', valor: 10 },
        historia: 'A cobrinha acorda sozinha num campo verde. Seu ninho sumiu numa tempestade cósmica na noite passada — só resta um brilho fraco no horizonte, apontando o caminho.' },
    { id: 2, nome: 'Sinais na Floresta', tema: 'Floresta', dificuldade: 'Normal', modo: 'Classico', mapa: 60, velocidade: 0.95, objetivo: { tipo: 'tempo', valor: 20 },
        historia: 'Entre as árvores altas, rastros estranhos cruzam o chão. Algo — ou alguém — passou por ali recentemente, na mesma direção do brilho.' },
    { id: 3, nome: 'Dunas Sem Fim', tema: 'Deserto', dificuldade: 'Normal', modo: 'SemParede', mapa: 85, velocidade: 1.0, objetivo: { tipo: 'tempo', valor: 25 },
        historia: 'O calor do deserto é sufocante e a areia engole os passos rápido demais. Resistir aqui é o primeiro verdadeiro teste da jornada.' },
    { id: 4, nome: 'Ecos do Mar', tema: 'Oceano', dificuldade: 'Normal', modo: 'Classico', mapa: 70, velocidade: 1.0, objetivo: { tipo: 'macasEmTempo', macas: 8, tempo: 20 },
        historia: 'A costa aparece de repente. Nas ondas, ecoa um som familiar — parecido com uma canção que a cobrinha jura já ter ouvido em casa. Precisa se apressar antes da maré subir.' },
    { id: 5, nome: 'Frio Cortante', tema: 'Gelo', dificuldade: 'Insano', modo: 'Obstaculos', mapa: 65, velocidade: 1.05, objetivo: { tipo: 'pontos', valor: 55 },
        historia: 'Um campo gelado se estende até onde a vista alcança. O brilho no horizonte pulsa mais forte aqui — está cada vez mais perto.' },
    { id: 6, nome: 'Sob o Pôr do Sol', tema: 'PorDoSol', dificuldade: 'Normal', modo: 'Classico', mapa: 70, velocidade: 1.0, objetivo: { tipo: 'macas', valor: 16 },
        historia: 'O céu incendeia em laranja e rosa. Por um instante, a cobrinha para só para admirar — e sente falta de casa mais do que nunca.' },
    { id: 7, nome: 'Trilhas de Menta', tema: 'Menta', dificuldade: 'Normal', modo: 'Infinito', mapa: 60, velocidade: 1.05, objetivo: { tipo: 'tempo', valor: 30 },
        historia: 'Um vale de folhas verde-claras, quieto demais. O silêncio pesa, mas a cobrinha segue em frente — parar agora não é opção.' },
    { id: 8, nome: 'Vinhas Antigas', tema: 'Vinho', dificuldade: 'Insano', modo: 'Classico', mapa: 75, velocidade: 1.1, objetivo: { tipo: 'macasEmTempo', macas: 10, tempo: 18 },
        historia: 'Ruínas cobertas de vinhas escuras escondem passagens antigas. Alguém morou por aqui, há muito tempo — talvez outros viajantes como ela, e nem todos tiveram sorte.' },
    { id: 9, nome: 'Veios de Cobre', tema: 'Cobre', dificuldade: 'Normal', modo: 'Espelho', mapa: 65, velocidade: 1.0, inimigos: 1, objetivo: { tipo: 'macas', valor: 16 },
        historia: 'O chão brilha com veios metálicos avermelhados. E dessa vez a cobrinha não está sozinha — algo rastejando também busca essas terras, e não parece nada amigável.' },
    { id: 10, nome: 'A Sombra da Ametista', tema: 'Ametista', dificuldade: 'Insano', modo: 'Obstaculos', mapa: 55, velocidade: 1.1, inimigos: 1, objetivo: { tipo: 'tempo', valor: 18 },
        historia: 'Cristais roxos gigantes bloqueiam a passagem, e uma cobra sombria surge das rachaduras, caçando. Sobreviver aqui é sobre fugir, não lutar — está na metade do caminho.' },
    { id: 11, nome: 'Campos de Esmeralda', tema: 'Esmeralda', dificuldade: 'Normal', modo: 'Classico', mapa: 85, velocidade: 1.0, objetivo: { tipo: 'pontos', valor: 85 },
        historia: 'Depois do perigo, um respiro: campos verdes brilhantes e calmos. A cobrinha recupera o fôlego antes do próximo desafio.' },
    { id: 12, nome: 'Circuitos Quebrados', tema: 'Cyberpunk', dificuldade: 'Insano', modo: 'Obstaculos', mapa: 65, velocidade: 1.1, objetivo: { tipo: 'macasEmTempo', macas: 12, tempo: 22 },
        historia: 'Estruturas neon abandonadas formam um labirinto de obstáculos. Algo aqui parece ter sido construído — e destruído — por outra criatura em fuga, igual a ela.' },
    { id: 13, nome: 'Silêncio Monocromo', tema: 'Monocromo', dificuldade: 'Insano', modo: 'Classico', mapa: 75, velocidade: 1.1, inimigos: 1, objetivo: { tipo: 'tempo', valor: 20 },
        historia: 'Um mundo sem cor, cinza do chão ao céu — e uma sombra sem rosto que se move entre os tons de cinza, quase invisível até estar perto demais.' },
    { id: 14, nome: 'O Rio de Lava', tema: 'Lava', dificuldade: 'Insano', modo: 'Classico', mapa: 60, velocidade: 1.25, objetivo: { tipo: 'pontos', valor: 100 },
        historia: 'O calor aqui é o mais intenso da jornada inteira. Um único deslize seria fatal — mas o brilho está tão próximo que já dá pra sentir seu calor diferente.' },
    { id: 15, nome: 'Fronteira Sem Fim', tema: 'Galaxia', dificuldade: 'Insano', modo: 'SemParede', mapa: 90, velocidade: 1.1, inimigos: 1, objetivo: { tipo: 'macas', valor: 20 },
        historia: 'O espaço aqui se dobra sobre si mesmo — sair por um lado do mundo faz reaparecer do outro. Pior: a cobrinha não é a única coisa que atravessa essas dobras.' },
    { id: 16, nome: 'Luzes de Neon', tema: 'Neon', dificuldade: 'Insano', modo: 'Espelho', mapa: 65, velocidade: 1.15, inimigos: 2, objetivo: { tipo: 'tempo', valor: 18 },
        historia: 'Uma cidade de luzes vazia, brilhante e rápida demais — e duas sombras rápidas que conhecem cada beco melhor do que ela.' },
    { id: 17, nome: 'A Fúria da Terra Ardente', tema: 'Lava', dificuldade: 'Insano', modo: 'Obstaculos', mapa: 60, velocidade: 1.3, objetivo: { tipo: 'macasEmTempo', macas: 14, tempo: 22 },
        historia: 'Rochas incandescentes bloqueiam quase todo o caminho, e o chão treme sem aviso. É a terra mais hostil até agora — mas também a mais próxima do fim da jornada.' },
    { id: 18, nome: 'Antes da Tempestade', tema: 'Dark', dificuldade: 'Insano', modo: 'Caos', mapa: 75, velocidade: 1.15, inimigos: 2, objetivo: { tipo: 'tempo', valor: 22 },
        historia: 'O céu escurece de repente. É a mesma tempestade de quando tudo começou — só que dessa vez, duas sombras vieram junto, e a cobrinha vai atravessá-la de volta.' },
    { id: 19, nome: 'Ecos do Passado', tema: 'Monocromo', dificuldade: 'Insano', modo: 'Gigante', mapa: 85, velocidade: 1.15, objetivo: { tipo: 'macasEmTempo', macas: 15, tempo: 10 },
        historia: 'Um horizonte sem cor, como uma lembrança antiga e quase esquecida — e por algum motivo, tudo aqui parece maior do que deveria. A cobrinha reconhece esse lugar: foi aqui que a jornada realmente começou, há muito tempo.' },
    { id: 20, nome: 'O Caminho de Volta', tema: 'Cosmos', dificuldade: 'Insano', modo: 'Classico', mapa: 80, velocidade: 1.35, inimigos: 2, objetivo: { tipo: 'pontos', valor: 150 },
        historia: 'O brilho finalmente revela sua origem: um ninho girando devagar entre as estrelas, esperando. Duas últimas sombras tentam impedir a passagem — essa é a última terra antes de casa. Vai com tudo!' }
];

let historiaAtiva = false;
let historiaNivelAtual = null;
let historiaObjetivo = null;
let historiaMacasComidas = 0;
let historiaVelocidadeMult = 1;
let historiaMapaInicial = null;
let historiaDificuldadeEscolhida = 'Normal';
let historiaInimigos = [];
let historiaInimigoContadorTick = 0;
let overlayModoHistoria = null;
let historiaProgresso = (() => {
    try {
        const salvo = JSON.parse(localStorage.snakeHistoriaProgresso || '{}');
        return {
            desbloqueado: salvo.desbloqueado || 1,
            completos: Array.isArray(salvo.completos) ? salvo.completos : []
        };
    } catch { return { desbloqueado: 1, completos: [] }; }
})();

function descreverObjetivoHistoria(o) {
    if (o.tipo === 'macas') return `🎯 Coma ${o.valor} maçãs`;
    if (o.tipo === 'pontos') return `🎯 Alcance ${o.valor} pontos`;
    if (o.tipo === 'tempo') return `🎯 Sobreviva ${o.valor} segundos`;
    if (o.tipo === 'macasEmTempo') return `🎯 Coma ${o.macas} maçãs em ${o.tempo}s!`;
    return '';
}

function verificarObjetivoHistoria() {
    if (!historiaAtiva || !historiaObjetivo || !run) return;
    let atingiu = false;
    if (historiaObjetivo.tipo === 'macas' && historiaMacasComidas >= historiaObjetivo.valor) atingiu = true;
    if (historiaObjetivo.tipo === 'pontos' && score >= historiaObjetivo.valor) atingiu = true;
    if (historiaObjetivo.tipo === 'tempo' && gameTime >= historiaObjetivo.valor) atingiu = true;
    if (historiaObjetivo.tipo === 'macasEmTempo') {
        if (historiaMacasComidas >= historiaObjetivo.macas) {
            atingiu = true;
        } else if (gameTime >= historiaObjetivo.tempo) {
            falharNivelHistoriaPorTempo();
            return;
        }
    }
    if (atingiu) venceuNivelHistoria();
}

function falharNivelHistoriaPorTempo() {
    if (!run) return;
    run = false;
    if (!devAtivo()) {
        coins += coinsThisRun;
        totalXP += score;
        localStorage.snakeCoins = coins;
        localStorage.snakeXP = totalXP;
    }
    vibrar([180]);
    mostrarResultadoHistoria(false, HISTORIA_NIVEIS[historiaNivelAtual - 1]);
}

/* =========================================================
   COBRAS INIMIGAS (fases de fuga do Modo História)
========================================================= */
function criarInimigosHistoria(qtd) {
    historiaInimigos = [];
    historiaInimigoContadorTick = 0;
    if (!qtd) return;
    for (let k = 0; k < qtd; k++) {
        let px = 5, py = 5, tentativas = 0;
        do {
            px = Math.floor(4 + Math.random() * (mapSize - 8));
            py = Math.floor(4 + Math.random() * (mapSize - 8));
            tentativas++;
        } while (tentativas < 200 && Math.hypot(px - s[0].x, py - s[0].y) < mapSize * 0.3);
        const segs = [];
        for (let seg = 0; seg < 5; seg++) segs.push({ x: px - seg, y: py });
        historiaInimigos.push({ segs, dir: { x: 1, y: 0 } });
    }
}
function moverInimigosHistoria() {
    if (!historiaInimigos.length) return;
    historiaInimigoContadorTick++;
    if (historiaInimigoContadorTick % 2 !== 0) return; // um pouco mais lentas que o jogador
    historiaInimigos.forEach(inimigo => {
        const head = inimigo.segs[0];
        const alvo = s[0];
        const dx = alvo.x - head.x, dy = alvo.y - head.y;
        const candidatos = [];
        if (Math.abs(dx) >= Math.abs(dy)) {
            candidatos.push({ x: Math.sign(dx) || 1, y: 0 });
            candidatos.push({ x: 0, y: Math.sign(dy) || 1 });
        } else {
            candidatos.push({ x: 0, y: Math.sign(dy) || 1 });
            candidatos.push({ x: Math.sign(dx) || 1, y: 0 });
        }
        [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }].forEach(d => {
            if (!candidatos.some(c => c.x === d.x && c.y === d.y)) candidatos.push(d);
        });
        let escolhido = null;
        for (const d of candidatos) {
            if (inimigo.segs.length > 1 && d.x === -inimigo.dir.x && d.y === -inimigo.dir.y) continue;
            const nx = head.x + d.x, ny = head.y + d.y;
            if (nx < 1 || ny < 1 || nx >= mapSize - 1 || ny >= mapSize - 1) continue;
            if (isObstacle({ x: nx, y: ny })) continue;
            escolhido = { x: nx, y: ny, dir: d };
            break;
        }
        if (!escolhido) return;
        inimigo.dir = escolhido.dir;
        inimigo.segs.unshift({ x: escolhido.x, y: escolhido.y });
        inimigo.segs.pop();
    });
}
function verificarColisaoInimigosHistoria() {
    if (!historiaAtiva || !historiaInimigos.length || !run) return;
    for (const inimigo of historiaInimigos) {
        for (const seg of inimigo.segs) {
            const colidiu = s.some(ps => celulasOcupadasPorSegmento(ps).some(c => c.x === seg.x && c.y === seg.y));
            if (colidiu) { end(); return; }
        }
    }
}
function desenharInimigosHistoria(area, cell) {
    if (!historiaInimigos.length) return;
    historiaInimigos.forEach(inimigo => {
        inimigo.segs.forEach((seg, idx) => {
            const px = area.x + seg.x * cell;
            const py = area.y + seg.y * cell;
            const m2 = cell * 0.06, tam2 = cell * 0.88;
            ctx.fillStyle = idx === 0 ? '#ff2d4e' : '#7a0f22';
            ctx.fillRect(px + m2, py + m2, tam2, tam2);
            if (idx === 0) {
                ctx.fillStyle = '#fff';
                const olho = Math.max(1.5, cell * 0.12);
                ctx.fillRect(px + cell * 0.25, py + cell * 0.25, olho, olho);
                ctx.fillRect(px + cell * 0.65, py + cell * 0.25, olho, olho);
            }
        });
    });
}

function venceuNivelHistoria() {
    if (!run) return;
    run = false;
    const nivel = HISTORIA_NIVEIS[historiaNivelAtual - 1];
    let recompensaMoedas = 0;
    if (!devAtivo()) {
        if (!historiaProgresso.completos.includes(nivel.id)) historiaProgresso.completos.push(nivel.id);
        historiaProgresso.desbloqueado = Math.max(historiaProgresso.desbloqueado, nivel.id + 1);
        localStorage.snakeHistoriaProgresso = JSON.stringify(historiaProgresso);
        recompensaMoedas = 20 + nivel.id * 5;
        const recompensaXP = 30 + nivel.id * 8;
        coins += recompensaMoedas;
        totalXP += recompensaXP;
        localStorage.snakeCoins = coins;
        localStorage.snakeXP = totalXP;
    }
    vibrar([40, 30, 40, 30, 80]);
    mostrarResultadoHistoria(true, nivel, recompensaMoedas);
}

function mostrarResultadoHistoria(sucesso, nivel, recompensaMoedas) {
    document.querySelector('#overlay h2').textContent = sucesso ? '⭐ FASE CONCLUÍDA!' : '💀 FASE NÃO CONCLUÍDA';
    const info = ensureOverlayInfo();
    info.textContent = sucesso
        ? `"${nivel.nome}" concluída! +${recompensaMoedas} 🪙`
        : `Você não completou "${nivel.nome}" a tempo. Tente de novo!`;
    if (devAtivo()) info.textContent += ' · 🛠 dev: nada foi salvo';
    const ultimaFase = nivel.id >= HISTORIA_NIVEIS.length;
    $('cont').textContent = sucesso ? (ultimaFase ? '🏁 FIM DA HISTÓRIA' : '➡ PRÓXIMA FASE') : '🔁 TENTAR DE NOVO';
    $('reset').classList.add('hide');
    $('overlay').classList.remove('hide');
    overlayModoHistoria = { sucesso, nivelId: nivel.id };
}

function renderHistoriaNiveis() {
    $('historiaNiveisLista').innerHTML = HISTORIA_NIVEIS.map(nivel => {
        const desbloqueado = nivel.id <= historiaProgresso.desbloqueado || (devAtivo() && devConfig.desbloquearFases);
        const completo = historiaProgresso.completos.includes(nivel.id);
        const classes = ['botaoFaseHistoria'];
        if (completo) classes.push('completa');
        if (!desbloqueado) classes.push('bloqueada');
        const icone = completo ? '⭐' : (desbloqueado ? '▶' : '🔒');
        return `
            <button class="${classes.join(' ')}" ${desbloqueado ? `data-fase="${nivel.id}"` : 'disabled'}>
                <span class="faseNumero">${icone} Fase ${nivel.id}</span>
                <span class="faseNome">${desbloqueado ? nivel.nome : '???'}</span>
            </button>`;
    }).join('');
    $('historiaNiveisLista').querySelectorAll('[data-fase]').forEach(btn => {
        btn.onclick = () => abrirCutsceneHistoria(parseInt(btn.dataset.fase, 10));
    });
    const total = HISTORIA_NIVEIS.length;
    $('historiaProgressoTexto').textContent = `${historiaProgresso.completos.length} / ${total} fases concluídas`;
}

let historiaCutsceneRaf = null;
let historiaTypewriterTimer = null;

function abrirCutsceneHistoria(id) {
    const nivel = HISTORIA_NIVEIS[id - 1];
    if (!nivel) { renderHistoriaNiveis(); showScreen('historiaNiveis'); return; }
    historiaNivelAtual = id;
    historiaDificuldadeEscolhida = nivel.dificuldade;
    $('historiaCutsceneTitulo').textContent = `Fase ${id}: ${nivel.nome}`;
    iniciarTypewriterCutscene(nivel.historia);
    const avisoInimigos = nivel.inimigos
        ? ` ⚠️ Fuja de ${nivel.inimigos} cobra${nivel.inimigos > 1 ? 's' : ''} inimiga${nivel.inimigos > 1 ? 's' : ''}!`
        : '';
    $('historiaCutsceneObjetivo').textContent = descreverObjetivoHistoria(nivel.objetivo) + avisoInimigos;
    renderDificuldadeHistoria();
    showScreen('historiaCutscene');
    animarCutsceneHistoria(nivel);
}

/* Efeito de "legenda de vídeo": o texto da cutscene aparece
   palavra por palavra, em vez de tudo de uma vez. */
function iniciarTypewriterCutscene(texto) {
    clearInterval(historiaTypewriterTimer);
    const el = $('historiaCutsceneTexto');
    el.textContent = '';
    const palavras = texto.split(' ');
    let i = 0;
    historiaTypewriterTimer = setInterval(() => {
        el.textContent += (i > 0 ? ' ' : '') + palavras[i];
        i++;
        if (i >= palavras.length) clearInterval(historiaTypewriterTimer);
    }, 45);
}

/* Mini animação da cutscene: um "vídeo" curto e barato em
   canvas — fundo com as cores do tema da fase, o brilho-guia
   pulsando, a cobrinha andando em loop e, se a fase tiver
   cobras inimigas, sombras vermelhas perseguindo por trás. */
function animarCutsceneHistoria(nivel) {
    const cnv = $('historiaCutsceneCanvas');
    if (!cnv) return;
    const g = cnv.getContext('2d');
    const w = cnv.width, h = cnv.height;
    const cores = T[nivel.tema] || T.Grama;
    function frame() {
        if ($('historiaCutscene').classList.contains('hide')) { historiaCutsceneRaf = null; return; }
        const t = Date.now();
        const fundo = g.createLinearGradient(0, 0, w, h);
        fundo.addColorStop(0, col(cores[0]));
        fundo.addColorStop(1, col(cores[1]));
        g.fillStyle = fundo;
        g.fillRect(0, 0, w, h);
        for (let e = 0; e < 10; e++) {
            const ex = (e * 53) % w;
            const ey = (e * 29) % h;
            const tit = Math.sin(t / 400 + e * 2) * 0.5 + 0.5;
            g.fillStyle = `rgba(255,255,255,${0.08 + tit * 0.1})`;
            g.fillRect(ex, ey, 2, 2);
        }
        const pulso = Math.sin(t / 400) * 0.5 + 0.5;
        g.fillStyle = `rgba(255, 230, 150, ${0.35 + pulso * 0.4})`;
        g.beginPath();
        g.arc(w - 26, 24, 12 + pulso * 4, 0, Math.PI * 2);
        g.fill();
        const progresso = (t / 3200) % 1;
        const cx = 24 + progresso * (w - 70);
        const cy = h - 28 + Math.sin(t / 220) * 4;
        g.font = '24px sans-serif';
        g.textBaseline = 'middle';
        if (nivel.inimigos) {
            for (let k = 0; k < nivel.inimigos; k++) {
                const ex = cx - 22 - k * 16;
                g.save();
                g.globalAlpha = 0.85;
                g.font = '18px sans-serif';
                g.fillText('🟥', ex, cy + 3);
                g.restore();
            }
        }
        g.fillText('🐍', cx, cy);
        historiaCutsceneRaf = requestAnimationFrame(frame);
    }
    if (historiaCutsceneRaf) cancelAnimationFrame(historiaCutsceneRaf);
    historiaCutsceneRaf = requestAnimationFrame(frame);
}

function renderDificuldadeHistoria() {
    const cont = $('historiaCutsceneDificuldade');
    if (!cont) return;
    cont.innerHTML = Object.keys(D).map(d => {
        const ativo = (d === historiaDificuldadeEscolhida) ? 'ativo' : '';
        return `<button class="opcaoLista ${ativo}" data-diffh="${d}">${d}</button>`;
    }).join('');
    cont.querySelectorAll('[data-diffh]').forEach(btn => {
        btn.onclick = () => {
            historiaDificuldadeEscolhida = btn.dataset.diffh;
            renderDificuldadeHistoria();
        };
    });
}

function iniciarNivelHistoria() {
    const nivel = HISTORIA_NIVEIS[historiaNivelAtual - 1];
    if (!nivel) return;
    historiaAtiva = true;
    historiaObjetivo = nivel.objetivo;
    historiaMacasComidas = 0;
    historiaVelocidadeMult = nivel.velocidade || 1;
    historiaMapaInicial = nivel.mapa || MAPA_INICIAL;
    theme = nivel.tema;
    diff = historiaDificuldadeEscolhida || nivel.dificuldade;
    mapMode = nivel.modo;
    apply();
    startRound();
    criarInimigosHistoria(nivel.inimigos || 0);
}

function mostrarEpilogoHistoria() {
    showScreen('historiaEpilogo');
}

function abrirSelecaoHistoria() {
    renderHistoriaNiveis();
    showScreen('historiaNiveis');
}

function sairHistoriaParaHome() {
    historiaAtiva = false;
    historiaInimigos = [];
    theme = localStorage.snakeTheme || 'Grama';
    if (!T[theme]) theme = 'Grama';
    diff = localStorage.snakeDiff || 'Normal';
    mapMode = localStorage.snakeMapMode || 'Classico';
    apply();
    renderTemas();
    renderDificuldades();
    renderModos();
    home();
}

ligarBotaoHistoriaInicial();
function ligarBotaoHistoriaInicial() {
    const btnAbrir = document.getElementById('openHistoria');
    if (btnAbrir) btnAbrir.onclick = abrirSelecaoHistoria;
    const btnVoltarHome = document.getElementById('historiaVoltarHome');
    if (btnVoltarHome) btnVoltarHome.onclick = sairHistoriaParaHome;
    const btnVoltarFases = document.getElementById('historiaCutsceneVoltar');
    if (btnVoltarFases) btnVoltarFases.onclick = () => { renderHistoriaNiveis(); showScreen('historiaNiveis'); };
    const btnComecarFase = document.getElementById('historiaCutsceneComecar');
    if (btnComecarFase) btnComecarFase.onclick = iniciarNivelHistoria;
    const btnVoltarEpilogo = document.getElementById('historiaEpilogoVoltar');
    if (btnVoltarEpilogo) btnVoltarEpilogo.onclick = () => { renderHistoriaNiveis(); showScreen('historiaNiveis'); };
}

/* =========================================================
   MODO DESENVOLVEDOR (privado)

   Como abrir: clicar em "Feito Por Diego" no topo e digitar a
   senha. Só o HASH da senha fica no código (a senha em si não).

   Regra de ouro: enquanto o modo dev está ATIVO, a partida é
   "não oficial" — NÃO entra no ranking (local nem global), NÃO
   soma moedas/XP e NÃO salva progresso da História. Assim nada
   do que você testa aqui interfere nos tops nem na economia.

   Aviso honesto: como o jogo roda no navegador, essa senha
   afasta curiosos, mas não é segurança de verdade (quem sabe
   mexer no DevTools consegue contornar). A proteção real do
   ranking global precisa ficar no servidor (regras do Supabase).

   Pra trocar a senha: abra o jogo, no console rode
   hashSenhaDev('SUA_NOVA_SENHA') e cole o resultado em DEV_HASH.
========================================================= */
const DEV_SALT = '44bdbc3d28b757816a2c42ed';
const DEV_ITER = 5000;
const DEV_HASH = 'd6082c4c197721c7b5391956426fb66000c8d31a7bd67fd0e0ebd9a5fbfcd5d1';

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
/* SHA-256 em JS puro: funciona em qualquer contexto (http, file://, https). */
function sha256Hex(texto) {
    const dados = new TextEncoder().encode(texto);
    const len = dados.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(dados);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(len * 8 / 0x100000000));
    dv.setUint32(total - 4, (len * 8) >>> 0);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], b = w[i - 2];
            const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
            const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(x => x.toString(16).padStart(8, '0')).join('');
}
function hashSenhaDev(senha) {
    let h = sha256Hex(DEV_SALT + senha);
    for (let i = 0; i < DEV_ITER; i++) h = sha256Hex(h + DEV_SALT);
    return h;
}

/* Campos configuráveis. Campo vazio = usa o padrão do jogo. */
const DEV_CAMPOS = [
    { id: 'velocidade', label: 'Velocidade', dica: 'multiplicador (1 = normal)', min: 0.2, max: 4, step: 0.1, ph: '1' },
    { id: 'valorMaca', label: 'Pontos por maçã', dica: 'padrão: 1 (Normal) / 2 (Insano)', min: 0, max: 100000, step: 1, ph: 'auto', inteiro: true },
    { id: 'multRgb', label: 'Multiplicador da maçã RGB', dica: 'padrão: 5x', min: 0, max: 1000, step: 0.5, ph: '5' },
    { id: 'moedasMaca', label: 'Moedas por maçã', dica: 'padrão: 2', min: 0, max: 100000, step: 1, ph: '2', inteiro: true },
    { id: 'moedasRgb', label: 'Moedas por maçã RGB', dica: 'padrão: 4', min: 0, max: 100000, step: 1, ph: '4', inteiro: true },
    { id: 'crescimento', label: 'Crescimento por maçã', dica: 'segmentos (padrão: igual aos pontos base)', min: 0, max: 50, step: 1, ph: 'auto', inteiro: true },
    { id: 'qtdMacas', label: 'Maçãs na tela', dica: 'padrão: 6 (Clássico) / 4 (outros)', min: 1, max: 50, step: 1, ph: 'auto', inteiro: true },
    { id: 'mapa', label: 'Tamanho inicial do mapa', dica: 'padrão: 75', min: 15, max: 150, step: 1, ph: '75', inteiro: true }
];
let devConfig = (() => {
    const base = { ativo: false, valores: {}, semEncolher: false, desbloquearFases: false };
    try {
        const salvo = JSON.parse(localStorage.snakeDevConfig || '{}');
        return {
            ativo: !!salvo.ativo,
            valores: (salvo.valores && typeof salvo.valores === 'object') ? salvo.valores : {},
            semEncolher: !!salvo.semEncolher,
            desbloquearFases: !!salvo.desbloquearFases
        };
    } catch { return base; }
})();
let devSessaoOk = false;
let devTentativas = 0;
let devBloqueadoAte = 0;

function devDesbloqueado() {
    if (devSessaoOk) return true;
    try {
        if (sessionStorage.getItem('snakeDevOk') === '1') { devSessaoOk = true; return true; }
    } catch { /* sem sessionStorage */ }
    return false;
}
/* Modo dev "valendo": desbloqueado nesta sessão E ligado no painel. */
function devAtivo() { return devDesbloqueado() && devConfig.ativo; }
/* Valor do campo já limitado ao intervalo; null = usar o padrão do jogo. */
function devVal(id) {
    if (!devAtivo()) return null;
    const bruto = devConfig.valores[id];
    if (bruto === '' || bruto === undefined || bruto === null) return null;
    const n = Number(bruto);
    if (!isFinite(n)) return null;
    const campo = DEV_CAMPOS.find(c => c.id === id);
    if (!campo) return null;
    const limitado = Math.min(campo.max, Math.max(campo.min, n));
    return campo.inteiro ? Math.round(limitado) : limitado;
}
function salvarDevConfig() {
    try { localStorage.snakeDevConfig = JSON.stringify(devConfig); } catch { /* ignora */ }
}

function abrirDev() {
    if (devDesbloqueado()) { abrirPainelDev(); return; }
    $('devSenha').value = '';
    $('devMensagem').classList.add('hide');
    $('modalDev').classList.remove('hide');
    $('devSenha').focus();
}
function mostrarMensagemDev(texto) {
    const msg = $('devMensagem');
    msg.textContent = texto;
    msg.classList.remove('hide');
}
function tentarDesbloquearDev() {
    const agora = Date.now();
    if (agora < devBloqueadoAte) {
        mostrarMensagemDev(`Muitas tentativas. Aguarde ${Math.ceil((devBloqueadoAte - agora) / 1000)}s.`);
        return;
    }
    if (hashSenhaDev($('devSenha').value) === DEV_HASH) {
        devSessaoOk = true;
        try { sessionStorage.setItem('snakeDevOk', '1'); } catch { /* ignora */ }
        devTentativas = 0;
        $('devSenha').value = '';
        $('modalDev').classList.add('hide');
        abrirPainelDev();
        return;
    }
    devTentativas++;
    if (devTentativas >= 5) {
        devBloqueadoAte = agora + 30000;
        devTentativas = 0;
        mostrarMensagemDev('Muitas tentativas. Aguarde 30s.');
    } else {
        mostrarMensagemDev('Senha incorreta.');
    }
    $('devSenha').value = '';
}
function renderPainelDev() {
    $('devCampos').innerHTML = DEV_CAMPOS.map(c => {
        const v = devConfig.valores[c.id];
        return `
            <label class="devLinha">
                <span class="devRotulo">${c.label}<small>${c.dica}</small></span>
                <input type="number" data-dev="${c.id}" min="${c.min}" max="${c.max}" step="${c.step}"
                    placeholder="${c.ph}" value="${(v === undefined || v === null) ? '' : v}">
            </label>`;
    }).join('');
    $('devCampos').querySelectorAll('[data-dev]').forEach(el => {
        el.oninput = () => { devConfig.valores[el.dataset.dev] = el.value; salvarDevConfig(); };
    });
    $('devAtivo').checked = devConfig.ativo;
    $('devSemEncolher').checked = devConfig.semEncolher;
    $('devDesbloquearFases').checked = devConfig.desbloquearFases;
}
function abrirPainelDev() {
    renderPainelDev();
    showScreen('devPanel');
}
function sairDoModoDev() {
    devSessaoOk = false;
    try { sessionStorage.removeItem('snakeDevOk'); } catch { /* ignora */ }
    devConfig.ativo = false;
    salvarDevConfig();
    home();
}
(function ligarModoDev() {
    const ligar = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    ligar('tituloHeader', abrirDev);
    ligar('devEntrar', tentarDesbloquearDev);
    ligar('devCancelar', () => $('modalDev').classList.add('hide'));
    ligar('devVoltar', () => home());
    ligar('devSair', sairDoModoDev);
    ligar('devRestaurar', () => { devConfig.valores = {}; salvarDevConfig(); renderPainelDev(); });
    const senha = document.getElementById('devSenha');
    if (senha) senha.addEventListener('keydown', e => { if (e.key === 'Enter') tentarDesbloquearDev(); });
    const chk = (id, campo) => {
        const el = document.getElementById(id);
        if (el) el.onchange = () => { devConfig[campo] = el.checked; salvarDevConfig(); };
    };
    chk('devAtivo', 'ativo');
    chk('devSemEncolher', 'semEncolher');
    chk('devDesbloquearFases', 'desbloquearFases');
})();

$('play').onclick = begin;
$('rank').onclick = showRank;
$('back').onclick = home;
$('menu').onclick = () => { if (run) togglePause(); else home(); };
$('pause').onclick = togglePause;
$('cont').onclick = () => {
    if (!run) {
        $('overlay').classList.add('hide');
        if (overlayModoHistoria) {
            const infoOH = overlayModoHistoria;
            overlayModoHistoria = null;
            resetOverlayParaPausa();
            if (infoOH.sucesso) {
                const proximoId = infoOH.nivelId + 1;
                if (proximoId <= HISTORIA_NIVEIS.length) abrirCutsceneHistoria(proximoId);
                else { historiaAtiva = false; mostrarEpilogoHistoria(); }
            } else {
                abrirCutsceneHistoria(infoOH.nivelId);
            }
        } else {
            resetOverlayParaPausa();
            startRound();
        }
    } else {
        togglePause();
    }
};
$('reset').onclick = () => {
    reset();
    paused = false;
    $('overlay').classList.add('hide');
    lastMove = performance.now();
    if (historiaAtiva) {
        const nivelAtual = HISTORIA_NIVEIS[historiaNivelAtual - 1];
        criarInimigosHistoria(nivelAtual ? (nivelAtual.inimigos || 0) : 0);
    }
};
$('tomenu').onclick = () => {
    overlayModoHistoria = null;
    if (historiaAtiva) {
        historiaAtiva = false;
        const appEl = document.querySelector('.app');
        if (appEl) appEl.classList.remove('semHeader');
        $('overlay').classList.add('hide');
        resetOverlayParaPausa();
        renderHistoriaNiveis();
        showScreen('historiaNiveis');
    } else {
        home();
    }
};
document.querySelectorAll('.voltarMenu').forEach(btn => { btn.onclick = home; });

const elAbrirNotas = $('abrirNotas');
if (elAbrirNotas) elAbrirNotas.onclick = () => { const notas = $('notasAtualizacao'); notas.classList.remove('fechada'); notas.classList.add('aberta'); };
const elFecharNotas = $('fecharNotas');
if (elFecharNotas) elFecharNotas.onclick = () => { const notas = $('notasAtualizacao'); notas.classList.remove('aberta'); notas.classList.add('fechada'); };
const elAlternarPrevia = $('alternarPrevia');
if (elAlternarPrevia) elAlternarPrevia.onclick = () => {
    const ligada = document.body.classList.toggle('previaLigada');
    $('alternarPrevia').textContent = ligada ? '🙈 Esconder prévia' : '👁 Mostrar prévia';
    if (!ligada) previaGrandeSkin = null;
};

function ligarBotao(id, acao) { const el = document.getElementById(id); if (el) el.onclick = acao; }
ligarBotao('openLogin', () => $('modalLogin').classList.remove('hide'));
ligarBotao('fecharLogin', () => { $('modalLogin').classList.add('hide'); const msg = $('loginMensagem'); if (msg) msg.classList.add('hide'); });
ligarBotao('btnGoogle', () => entrarComProvider('google'));
ligarBotao('btnFacebook', () => entrarComProvider('facebook'));
ligarBotao('btnEmail', entrarComEmail);
ligarBotao('btnLogout', sair);
ligarBotao('btnConfirmarNick', confirmarNick);
ligarBotao('pularNick', esconderEscolhaNick);
const inputNickEscolha = document.getElementById('nickEscolha');
if (inputNickEscolha) inputNickEscolha.addEventListener('keydown', e => { if (e.key === 'Enter') confirmarNick(); });

$('name').oninput = e => { localStorage.snakeName = e.target.value; nickAlterado(); atualizarUIAuth(); };

function renderTemas() {
    const lista = Object.keys(T);
    $('listaTemas').innerHTML = lista.map(t => {
        const cores = T[t];
        const ativo = (t === theme);
        const corPrincipal = col(cores[1]), corSecundaria = col(cores[2]);
        return `<div class="temaSwatch ${ativo ? 'ativa' : ''}" data-tema="${t}" style="background: linear-gradient(135deg, ${corPrincipal}, ${corSecundaria});"><span>${t}</span></div>`;
    }).join('');
    $('listaTemas').querySelectorAll('[data-tema]').forEach(el => {
        el.onclick = () => { theme = el.dataset.tema; localStorage.snakeTheme = theme; apply(); renderTemas(); salvarProgresso(); };
    });
}
function renderDificuldades() {
    const lista = Object.keys(D);
    $('listaDificuldades').innerHTML = lista.map(d => {
        const ativo = (d === diff) ? 'ativo' : '';
        return `<button class="opcaoLista ${ativo}" data-diff="${d}">${d}</button>`;
    }).join('');
    $('listaDificuldades').querySelectorAll('[data-diff]').forEach(btn => {
        btn.onclick = () => { diff = btn.dataset.diff; localStorage.snakeDiff = diff; apply(); renderDificuldades(); salvarProgresso(); };
    });
}
function renderModos() {
    $('listaModos').innerHTML = MAPMODES.map(m => {
        const ativo = (m === mapMode) ? 'ativo' : '';
        return `<button class="opcaoLista ${ativo}" data-modo="${m}">${MAPMODE_LABEL[m]}</button>`;
    }).join('');
    $('listaModos').querySelectorAll('[data-modo]').forEach(btn => {
        btn.onclick = () => { mapMode = btn.dataset.modo; localStorage.snakeMapMode = mapMode; apply(); renderModos(); salvarProgresso(); };
    });
}

let previaAnimRaf = null;
let previaGrandeSkin = null;
let simPrev = null;
function simPrevReset() {
    const cols = 10, rows = 15;
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    simPrev = { cols, rows, snake: [[cx, cy], [cx - 1, cy], [cx - 2, cy]], dir: [1, 0], maca: [Math.min(cols - 1, cx + 3), Math.max(0, cy - 4)], ultimo: 0 };
}
function simPrevPasso() {
    const s = simPrev;
    const hx = s.snake[0][0], hy = s.snake[0][1];
    const dx = s.maca[0] - hx, dy = s.maca[1] - hy;
    const prefs = [];
    if (Math.abs(dx) >= Math.abs(dy)) { if (dx) prefs.push([Math.sign(dx), 0]); if (dy) prefs.push([0, Math.sign(dy)]); }
    else { if (dy) prefs.push([0, Math.sign(dy)]); if (dx) prefs.push([Math.sign(dx), 0]); }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => { if (!prefs.some(p => p[0] === d[0] && p[1] === d[1])) prefs.push(d); });
    const oposta = [-s.dir[0], -s.dir[1]];
    let achou = false;
    for (const d of prefs) {
        if (d[0] === oposta[0] && d[1] === oposta[1]) continue;
        const nx = hx + d[0], ny = hy + d[1];
        if (nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows) continue;
        if (s.snake.some((c, idx) => idx < s.snake.length - 1 && c[0] === nx && c[1] === ny)) continue;
        s.dir = d;
        achou = true;
        break;
    }
    const nx = hx + s.dir[0], ny = hy + s.dir[1];
    if (!achou || nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows || s.snake.some(c => c[0] === nx && c[1] === ny)) { simPrevReset(); return; }
    s.snake.unshift([nx, ny]);
    if (nx === s.maca[0] && ny === s.maca[1]) {
        let t = 0;
        do {
            s.maca = [Math.floor(Math.random() * s.cols), Math.floor(Math.random() * s.rows)];
            t++;
        } while (t < 300 && s.snake.some(c => c[0] === s.maca[0] && c[1] === s.maca[1]));
        if (s.snake.length > 12) s.snake.pop();
    } else {
        s.snake.pop();
    }
}
function desenharMiniEstatica(cnv) {
    const g = cnv.getContext('2d');
    const w = cnv.width, h = cnv.height;
    g.clearRect(0, 0, w, h);
    const skinOrig = skin, corOrig = color;
    skin = cnv.dataset.skin;
    const n = 5;
    const cell = h * 0.30;
    let hx = 0, hy = 0;
    for (let i = n - 1; i >= 0; i--) {
        const t = i * 0.75;
        const x = w * 0.16 + i * (w * 0.68 / (n - 1));
        const y = h / 2 + Math.sin(t) * h * 0.14;
        desenharSegmento(x - cell / 2, y - cell / 2, cell, i, n, g);
        if (i === 0) { hx = x - cell / 2; hy = y - cell / 2; }
    }
    const olho = Math.max(1.5, cell * 0.13);
    g.fillStyle = '#fff';
    g.fillRect(hx + cell * 0.25, hy + cell * 0.25, olho, olho);
    g.fillRect(hx + cell * 0.65, hy + cell * 0.25, olho, olho);
    skin = skinOrig;
    color = corOrig;
}
let ultimoFramePrevias = 0;
function animarPreviasSkins() {
    const aberta = !$('menuSkins').classList.contains('hide');
    document.body.classList.toggle('mostrandoSkins', aberta && (window.innerWidth >= 900 || document.body.classList.contains('previaLigada')));
    if (!aberta) { previaAnimRaf = null; return; }
    const agora = Date.now();
    if (agora - ultimoFramePrevias < 80) { previaAnimRaf = requestAnimationFrame(animarPreviasSkins); return; }
    ultimoFramePrevias = agora;

    if (!ehMobile) document.querySelectorAll('#listaSkins .previaCanvas').forEach(cnv => {
        const g = cnv.getContext('2d');
        const w = cnv.width, h = cnv.height;
        g.clearRect(0, 0, w, h);
        const skinOrig = skin, corOrig = color;
        skin = cnv.dataset.skin;
        const n = 5;
        const cell = h * 0.30;
        let hx = 0, hy = 0;
        for (let i = n - 1; i >= 0; i--) {
            const t = agora / 320 + i * 0.75;
            const x = w * 0.16 + i * (w * 0.68 / (n - 1));
            const y = h / 2 + Math.sin(t) * h * 0.14;
            desenharSegmento(x - cell / 2, y - cell / 2, cell, i, n, g);
            if (i === 0) { hx = x - cell / 2; hy = y - cell / 2; }
        }
        const olho = Math.max(1.5, cell * 0.13);
        g.fillStyle = '#fff';
        g.fillRect(hx + cell * 0.25, hy + cell * 0.25, olho, olho);
        g.fillRect(hx + cell * 0.65, hy + cell * 0.25, olho, olho);
        skin = skinOrig;
        color = corOrig;
    });

    const pgCnv = $('previaGrandeCanvas');
    if (pgCnv) {
        if (!simPrev) simPrevReset();
        let passos = 0;
        while (agora - simPrev.ultimo >= 140 && passos < 5) { simPrev.ultimo += 140; simPrevPasso(); passos++; }
        if (agora - simPrev.ultimo >= 700) simPrev.ultimo = agora;
        const nomePg = previaGrandeSkin || skin;
        const gP = pgCnv.getContext('2d');
        const w = pgCnv.width, h = pgCnv.height;
        const tP = T[theme];
        const cellP = w / simPrev.cols;
        gP.fillStyle = col(tP[0]);
        gP.fillRect(0, 0, w, h);
        for (let y = 0; y < simPrev.rows; y++) {
            for (let x = 0; x < simPrev.cols; x++) {
                if ((x + y) % 2 === 0) continue;
                gP.fillStyle = col(tP[1]);
                gP.fillRect(x * cellP, y * cellP, cellP + 1, cellP + 1);
            }
        }
        gP.strokeStyle = col(tP[3]);
        gP.lineWidth = 3;
        gP.strokeRect(1.5, 1.5, w - 3, h - 3);
        desenharMaca(gP, simPrev.maca[0] * cellP, simPrev.maca[1] * cellP, cellP, agora);
        const skinOrig2 = skin, corOrig2 = color;
        skin = nomePg;
        const nG = simPrev.snake.length;
        for (let i = nG - 1; i >= 0; i--) { const c = simPrev.snake[i]; desenharSegmento(c[0] * cellP, c[1] * cellP, cellP, i, nG, gP); }
        const hc = simPrev.snake[0];
        const olhoG = Math.max(2, cellP * 0.13);
        gP.fillStyle = '#fff';
        gP.fillRect(hc[0] * cellP + cellP * 0.25, hc[1] * cellP + cellP * 0.25, olhoG, olhoG);
        gP.fillRect(hc[0] * cellP + cellP * 0.65, hc[1] * cellP + cellP * 0.25, olhoG, olhoG);
        skin = skinOrig2;
        color = corOrig2;
        const infoPg = SKIN_INFO[nomePg] || { nome: nomePg };
        let situacao;
        if (nomePg === skin) situacao = '✔ SELECIONADA';
        else if (skinDesbloqueada(nomePg)) situacao = 'Toque em Selecionar';
        else situacao = `🔒 Nível ${infoPg.nivel} · ou 🪙 ${infoPg.custo}`;
        const elNomePg = $('previaGrandeNome');
        const elStatusPg = $('previaGrandeStatus');
        if (elNomePg) elNomePg.textContent = infoPg.nome;
        if (elStatusPg) elStatusPg.textContent = situacao;
    }
    previaAnimRaf = requestAnimationFrame(animarPreviasSkins);
}
function renderSkins() {
    $('skinsCoins').textContent = coins;
    $('skinsLevel').textContent = playerLevel();
    $('listaSkins').innerHTML = SKINS.map(nomeSkin => {
        const info = SKIN_INFO[nomeSkin];
        const desbloqueada = skinDesbloqueada(nomeSkin);
        const ativa = (nomeSkin === skin);
        let acaoHtml;
        if (ativa) acaoHtml = `<span class="tagSelecionada">SELECIONADA</span>`;
        else if (desbloqueada) acaoHtml = `<button class="botaoSelecionar" data-selecionar="${nomeSkin}">Selecionar</button>`;
        else {
            const podeComprar = coins >= info.custo;
            acaoHtml = `<span class="infoBloqueio">Nível ${info.nivel} ou</span><button class="botaoComprar" data-comprar="${nomeSkin}" ${podeComprar ? '' : 'disabled'}>🪙 ${info.custo}</button>`;
        }
        return `<div class="linhaSkin ${ativa ? 'ativa' : ''}"><div class="previaSkin previa-${nomeSkin}"><canvas class="previaCanvas" data-skin="${nomeSkin}" width="84" height="84"></canvas>${ehMobile ? `<button class="btnOlhoPrev" data-olho="${nomeSkin}" aria-label="Ver prévia de ${info.nome}">👁</button>` : ''}</div><div class="infoSkin"><b>${info.nome}</b></div><div class="acaoSkin">${acaoHtml}</div></div>`;
    }).join('');
    if (ehMobile) $('listaSkins').querySelectorAll('.previaCanvas').forEach(desenharMiniEstatica);
    if (!previaAnimRaf) previaAnimRaf = requestAnimationFrame(animarPreviasSkins);
    previaGrandeSkin = null;
    $('listaSkins').querySelectorAll('.linhaSkin').forEach(linha => {
        linha.addEventListener('mouseenter', () => { const cnvL = linha.querySelector('.previaCanvas'); if (cnvL) previaGrandeSkin = cnvL.dataset.skin; });
    });
    $('listaSkins').querySelectorAll('[data-olho]').forEach(btn => {
        btn.onclick = () => {
            const nSk = btn.dataset.olho;
            if (document.body.classList.contains('previaLigada') && previaGrandeSkin === nSk) { document.body.classList.remove('previaLigada'); previaGrandeSkin = null; }
            else { previaGrandeSkin = nSk; document.body.classList.add('previaLigada'); }
            $('listaSkins').querySelectorAll('.btnOlhoPrev').forEach(b => b.classList.toggle('olhoAtivo', b.dataset.olho === previaGrandeSkin));
        };
    });
    $('listaSkins').querySelectorAll('[data-selecionar]').forEach(btn => {
        btn.onclick = () => { skin = btn.dataset.selecionar; localStorage.snakeSkin = skin; apply(); renderSkins(); salvarProgresso(); };
    });
    $('listaSkins').querySelectorAll('[data-comprar]').forEach(btn => {
        btn.onclick = () => {
            const nomeSkin = btn.dataset.comprar;
            const info = SKIN_INFO[nomeSkin];
            if (coins < info.custo) return;
            coins -= info.custo;
            ownedSkins.add(nomeSkin);
            localStorage.snakeCoins = coins;
            localStorage.snakeOwnedSkins = JSON.stringify([...ownedSkins]);
            skin = nomeSkin;
            localStorage.snakeSkin = skin;
            apply();
            renderSkins();
            salvarProgresso();
        };
    });
}
$('openSkins').onclick = () => { renderSkins(); showScreen('menuSkins'); };

resize();
reset();
draw();
atualizarStatusJogador();
renderTemas();
renderDificuldades();
renderModos();
if (sb) {
    sb.auth.getSession().then(({ data }) => {
        usuarioLogado = (data && data.session && data.session.user) || null;
        atualizarUIAuth();
        if (usuarioLogado) sincronizarProgresso();
    }).catch(() => atualizarUIAuth());
    sb.auth.onAuthStateChange((_evento, sessao) => {
        usuarioLogado = (sessao && sessao.user) || null;
        atualizarUIAuth();
        if (usuarioLogado) sincronizarProgresso();
    });
} else {
    atualizarUIAuth();
}
