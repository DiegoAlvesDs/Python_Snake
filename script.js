/* =========================================================
   SUPABASE
========================================================= */
const SUPABASE_URL = 'https://yfijtchpwohulhzamlre.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5kL_MJ5oYHzD0X5OCecCmQ_TZ5h-HiI';

/* =========================================================
   DETECÇÃO DE PLATAFORMA (PC x Mobile)
   O jogo se adapta: PC joga com teclado (sem D-pad),
   mobile com toque (D-pad maior, swipe e vibração).
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

/* Dica de controles adaptada à plataforma */
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
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
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
            // Nick escolhido uma vez: com conta definida, o campo trava
            inputNome.disabled = !!nickDaConta;
            inputNome.placeholder = nickDaConta ? 'Nick fixo da conta' : 'Escolha seu nick (só uma vez!)';
        }
        const provedor = (usuarioLogado.app_metadata && usuarioLogado.app_metadata.provider) || 'email';
        const nomeProvedor = provedor === 'google' ? 'Google'
            : provedor === 'facebook' ? 'Facebook'
            : 'Email';
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
        provider,
        options: { redirectTo: window.location.origin + window.location.pathname }
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
    if (!email || !email.includes('@')) {
        mostrarMensagemLogin('Digite um email válido.', true);
        return;
    }
    mostrarMensagemLogin('Enviando link...', false);
    const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
        mostrarMensagemLogin('Não foi possível enviar: ' + error.message, true);
        return;
    }
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
    if (inputNome) {
        inputNome.disabled = false;
        inputNome.placeholder = 'Nome do jogador';
    }
    atualizarUIAuth();
}

/* =========================================================
   PROGRESSO NA CONTA (sync de moedas/XP/skins/nick)
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
        moedas: coins,
        xp: totalXP,
        skins: JSON.stringify([...ownedSkins]),
        skin_ativa: skin,
        tema: theme,
        dificuldade: diff,
        modo: mapMode,
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
    if (typeof p.moedas === 'number' && p.moedas >= 0) {
        coins = p.moedas;
        localStorage.snakeCoins = coins;
    }
    if (typeof p.xp === 'number' && p.xp >= 0) {
        totalXP = p.xp;
        localStorage.snakeXP = totalXP;
    }
    if (typeof p.skins === 'string') {
        try {
            const lista = JSON.parse(p.skins);
            if (Array.isArray(lista)) {
                ownedSkins = new Set(lista);
                localStorage.snakeOwnedSkins = p.skins;
            }
        } catch { /* ignora skins corrompidas */ }
    }
    if (p.skin_ativa && SKIN_INFO[p.skin_ativa]) {
        skin = p.skin_ativa;
        localStorage.snakeSkin = skin;
    }
    if (p.tema && T[p.tema]) {
        theme = p.tema;
        localStorage.snakeTheme = theme;
    }
    if (p.dificuldade && D[p.dificuldade]) {
        diff = p.dificuldade;
        localStorage.snakeDiff = diff;
    }
    if (p.modo && MAPMODES.includes(p.modo)) {
        mapMode = p.modo;
        localStorage.snakeMapMode = mapMode;
    }
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
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({ user_id: usuarioLogado.id, ...estadoProgresso() })
        });
        if (!resposta.ok) console.error('Erro ao salvar progresso:', await resposta.text());
    } catch (erro) {
        console.error('Erro de conexão ao salvar progresso:', erro);
    }
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
        if (!resposta.ok) {
            console.error('Erro ao carregar progresso:', await resposta.text());
            return;
        }
        const lista = await resposta.json();
        if (lista && lista.length) {
            aplicarProgresso(lista[0]);
            atualizarUIAuth();
            if (!nickDaConta) mostrarEscolhaNick();
        } else {
            mostrarEscolhaNick();
        }
    } catch (erro) {
        console.error('Erro de conexão ao sincronizar progresso:', erro);
    }
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
   ESCOLHA DE NICK (uma vez só)
========================================================= */
function mostrarEscolhaNick() {
    const modal = document.getElementById('modalNick');
    if (!modal || nickDaConta) return;
    const input = document.getElementById('nickEscolha');
    if (input && !input.value.trim()) {
        input.value = (localStorage.snakeName || '').trim().slice(0, 12);
    }
    modal.classList.remove('hide');
}

function esconderEscolhaNick() {
    const modal = document.getElementById('modalNick');
    if (modal) modal.classList.add('hide');
}

async function confirmarNick() {
    const input = document.getElementById('nickEscolha');
    const nick = ((input && input.value) || '').trim().slice(0, 12);
    if (!nick) {
        if (input) {
            input.placeholder = 'Digite um nick!';
            input.focus();
        }
        return;
    }
    nickDaConta = nick;
    localStorage.snakeName = nick;
    const inputNome = document.getElementById('name');
    if (inputNome) {
        inputNome.value = nick;
        inputNome.disabled = true;
        inputNome.placeholder = 'Nick fixo da conta';
    }
    esconderEscolhaNick();
    await salvarProgresso();
    atualizarUIAuth();
}

async function salvarRanking(nome, pontuacao, tempo, modo) {
    const corpo = { nome, pontuacao, tempo, modo, dificuldade: diff };
    if (usuarioLogado) corpo.user_id = usuarioLogado.id;
    try {
        let resposta = await fetch(`${SUPABASE_URL}/rest/v1/ranking`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(corpo)
        });
        if (!resposta.ok && usuarioLogado) {
            delete corpo.user_id;
            resposta = await fetch(`${SUPABASE_URL}/rest/v1/ranking`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(corpo)
            });
        }
        if (!resposta.ok) console.error('Erro ao salvar ranking:', await resposta.text());
    } catch (erro) {
        console.error('Erro de conexão com Supabase:', erro);
    }
}

async function carregarRanking(modo) {
    try {
        const resposta = await fetch(
            `${SUPABASE_URL}/rest/v1/ranking_melhores?select=nome,pontuacao,tempo,dificuldade,modo,criado_em&modo=eq.${encodeURIComponent(modo)}&order=pontuacao.desc,criado_em.asc&limit=50`,
            { method: 'GET', headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
        );
        if (!resposta.ok) { console.error('Erro ao carregar ranking:', await resposta.text()); return null; }
        return await resposta.json();
    } catch (erro) {
        console.error('Erro de conexão com Supabase:', erro);
        return null;
    }
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
    Cosmos:    [[2, 2, 10], [10, 8, 30], [18, 14, 50], [160, 130, 255]],
    Abismo:    [[1, 8, 20], [4, 22, 42], [6, 34, 60], [80, 200, 255]],
    Vulcao:    [[18, 4, 2], [38, 10, 6], [58, 16, 8], [255, 140, 60]],
    Tempestade:[[6, 8, 14], [16, 20, 32], [22, 28, 46], [150, 190, 255]],
    Retro:     [[10, 4, 24], [26, 8, 48], [38, 12, 68], [255, 70, 200]],
    Sakura:    [[17, 6, 22], [40, 14, 46], [62, 22, 68], [255, 175, 205]]
};

/* =========================================================
   DIFICULDADE
========================================================= */
const D = { Normal: [13, 1], Insano: [25, 2] };

/* =========================================================
   MULTIPLICADOR DE VALOR DA MAÇÃ (afeta pontos e, por
   consequência, o XP ganho no fim da partida, já que
   totalXP soma o score da partida)
========================================================= */
const MULTIPLICADOR_MACA = 1;

/* =========================================================
   CORES DA COBRA
========================================================= */
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
    return mapMode === 'Classico' || mapMode === 'SemParede' || mapMode === 'Obstaculos';
}
function quantidadeMacas() {
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

/* =========================================================
   ESCALA DA COBRA (quantas células de largura/altura cada
   segmento ocupa — sempre um quadrado NxN, física e visual
   batendo). 1 = padrão. No modo de mapa "Gigante" a cobra
   é 2x com QUALQUER skin equipada.
========================================================= */
function escalaAtual() {
    return (mapMode === 'Gigante') ? 2 : 1;
}

/* =========================================================
   CONFIGURAÇÕES DO MAPA
========================================================= */
const MAPA_INICIAL = 75;
const MAPA_MINIMO = 20;
const MAPA_TAMANHO_TELA = 1;
let mapSize = MAPA_INICIAL;

/* =========================================================
   DADOS SALVOS
========================================================= */
let theme = localStorage.snakeTheme || 'Grama';
if (!T[theme]) theme = 'Grama'; /* tema antigo removido (ex.: Outono) volta pro padrão */
let diff = localStorage.snakeDiff || 'Normal';
let rank = JSON.parse(localStorage.snakeRank || '[]');
let name = localStorage.snakeName || '';
let mapMode = localStorage.snakeMapMode || 'Classico';
let skin = localStorage.snakeSkin || 'Solida';
if (!SKIN_INFO[skin]) {
    /* skin removida do jogo: volta pra Sólida */
    skin = 'Solida';
    localStorage.snakeSkin = skin;
}

/* =========================================================
   MOEDAS / XP / SKINS POSSUÍDAS
========================================================= */
let coins = parseInt(localStorage.snakeCoins || '0', 10) || 0;
let totalXP = parseInt(localStorage.snakeXP || '0', 10) || 0;
let ownedSkins = new Set(JSON.parse(localStorage.snakeOwnedSkins || '["Solida","Listrada"]'));
/* limpa skins que não existem mais do catálogo */
[...ownedSkins].forEach(nSk => {
    if (!SKIN_INFO[nSk]) ownedSkins.delete(nSk);
});
let coinsThisRun = 0;

function playerLevel() { return 1 + Math.floor(totalXP / 100); }
function skinDesbloqueada(nomeSkin) {
    return ownedSkins.has(nomeSkin) || playerLevel() >= SKIN_INFO[nomeSkin].nivel;
}

/* =========================================================
   OBSTÁCULOS / NÍVEL
========================================================= */
let obstacles = new Set();
let level = 1;

/* =========================================================
   VARIÁVEIS DO JOGO
========================================================= */
let s = [];
let prevS = [];               // posição anterior de cada segmento, p/ animação suave
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

/* ---------------- tempo ---------------- */
let start = 0;
let pausedAt = 0;
let totalPaused = 0;
let gameTime = 0;
let lastMove = 0;

/* ---------------- rgb ---------------- */
let nextRgbScore = 20;

/* ---------------- modo velocidade ---------------- */
let velocidadeExtraApple = 0;

/* ---------------- modo caos ---------------- */
let proximoEventoCaos = 0;
let efeitoTemporario = null;
let mensagemEvento = '';
let mensagemEventoAte = 0;

/* =========================================================
   ELEMENTOS
========================================================= */
const $ = id => document.getElementById(id);
const cv = $('canvas');
const ctx = cv.getContext('2d');
$('name').value = name;

/* =========================================================
   COR
========================================================= */
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
========================================================= */
function desenharSegmento(px, py, cell, i, tamanho, g) {
    g = g || ctx;
    const m = cell * 0.05;
    const tam = cell * 0.90;

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
    } else if (skin === 'Espinhada') {
        /* Espinhosa: ouriço de guerra — lâminas ósseas
           afiadas apontando pra fora, alternando de tamanho,
           com brilho metálico correndo pela cobra. */
        g.fillStyle = color;
        g.fillRect(px + m, py + m, tam, tam);
        const brilhoE = Math.sin(Date.now() / 300 + i * 0.55) * 0.5 + 0.5;
        const xB = (((Date.now() / 700 + i * 0.2) % 1.4) - 0.2) * cell;
        const refE = g.createLinearGradient(xB - cell * 0.18, py, xB + cell * 0.18, py + cell);
        refE.addColorStop(0, 'rgba(255, 255, 255, 0)');
        refE.addColorStop(0.5, `rgba(255, 255, 255, ${0.15 + brilhoE * 0.25})`);
        refE.addColorStop(1, 'rgba(255, 255, 255, 0)');
        g.fillStyle = refE;
        g.fillRect(px + m, py + m, tam, tam);
        const grande = i % 2 === 0;
        const comp = cell * (grande ? 0.3 : 0.2);
        const meia = cell / 2;
        g.fillStyle = '#e8e4d8';
        g.strokeStyle = 'rgba(30, 30, 34, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.03);
        [[0, meia, -1, 0], [cell, meia, 1, 0], [meia, 0, 0, -1], [meia, cell, 0, 1]].forEach(es => {
            const ex = px + es[0], ey = py + es[1], dxE = es[2], dyE = es[3];
            const perpx = dyE, perpy = dxE;
            const baseE = cell * 0.11;
            g.beginPath();
            g.moveTo(ex + perpx * baseE, ey + perpy * baseE);
            g.lineTo(ex + dxE * comp, ey + dyE * comp);
            g.lineTo(ex - perpx * baseE, ey - perpy * baseE);
            g.closePath();
            g.fill();
            g.stroke();
        });
        g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        g.lineWidth = Math.max(1, cell * 0.04);
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
    } else if (skin === 'Fogo') {
        /* Fogo: brasa viva com línguas de chama subindo e
           fagulhas que escapam do corpo. */
        const tremor = Math.sin(Date.now() / 90 + i * 1.3) * 0.5 + 0.5;
        const respirarF = Math.sin(Date.now() / 300 + i * 0.7) * 0.5 + 0.5;
        const corpoF = g.createLinearGradient(px, py + cell, px, py);
        corpoF.addColorStop(0, '#8a1a00');
        corpoF.addColorStop(0.4, '#e83c08');
        corpoF.addColorStop(0.8, `rgb(255, ${140 + (tremor * 60 | 0)}, 30)`);
        corpoF.addColorStop(1, `rgba(255, 236, 160, ${0.75 + tremor * 0.25})`);
        g.shadowBlur = cell * (0.4 + respirarF * 0.35);
        g.shadowColor = '#ff7a1f';
        g.fillStyle = corpoF;
        g.fillRect(px + m, py + m, tam, tam);
        g.shadowBlur = 0;
        for (let lh = 0; lh < 2; lh++) {
            const faseCh = (Date.now() / 220 + i * 0.45 + lh * 0.5) % 1;
            const lx = px + cell * (0.3 + lh * 0.38);
            const alt = cell * (0.2 + faseCh * 0.3);
            g.fillStyle = `rgba(255, ${(200 + faseCh * 55) | 0}, ${80 + (faseCh * 100 | 0)}, ${(1 - faseCh) * 0.8})`;
            g.beginPath();
            g.moveTo(lx - cell * 0.09, py + cell * 0.55);
            g.quadraticCurveTo(lx, py + cell * 0.55 - alt * 1.4, lx + cell * 0.09, py + cell * 0.55);
            g.closePath();
            g.fill();
        }
        const angS = (Date.now() / 260 + i * 2.1) % (Math.PI * 2);
        g.fillStyle = 'rgba(255, 220, 120, 0.9)';
        g.fillRect(px + cell / 2 + Math.cos(angS) * cell * 0.3 - cell * 0.04,
            py + cell / 2 + Math.sin(angS) * cell * 0.3 - cell * 0.04,
            Math.max(1.5, cell * 0.07), Math.max(1.5, cell * 0.07));
    } else if (skin === 'Camuflada') {
        /* Camuflada: manchas orgânicas de mata sobre verde
           militar, com sombra que se move devagar e costura
           de uniforme na borda. */
        g.fillStyle = '#3a4d2b';
        g.fillRect(px + m, py + m, tam, tam);
        const tonsC = ['#2e3b22', '#4a5c33', '#6b7a45', '#23301a'];
        for (let b = 0; b < 4; b++) {
            const s1 = ((i * 37 + b * 101) % 97) / 97;
            const s2 = ((i * 53 + b * 71) % 89) / 89;
            const bx = px + cell * (0.12 + s1 * 0.66) + Math.sin(Date.now() / 2400 + b * 1.7 + i * 0.4) * cell * 0.05;
            const by = py + cell * (0.12 + s2 * 0.66) + Math.cos(Date.now() / 2600 + b * 1.3 + i * 0.3) * cell * 0.05;
            g.fillStyle = tonsC[(i + b) % tonsC.length];
            g.beginPath();
            g.ellipse(bx, by, cell * 0.19, cell * 0.13, s1 * 3, 0, Math.PI * 2);
            g.fill();
        }
        g.setLineDash([cell * 0.12, cell * 0.09]);
        g.strokeStyle = 'rgba(20, 26, 14, 0.6)';
        g.lineWidth = Math.max(1, cell * 0.045);
        g.strokeRect(px + m, py + m, tam, tam);
        g.setLineDash([]);
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
           orbitando — bem diferente da Estelar, que é a noite
           escura com estrelas. */
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
           vermelho pulsando no peito, como placa de batalha. */
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
           cinza-escuro, trocando de posição a cada frame para
           parecer um espelho em movimento. */
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
           (joias) unidos por linhas de chumbo, com brilho
           de luz atravessando o vidro. */
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
    document.documentElement.style.setProperty('--c1', col(t[1]));
    document.documentElement.style.setProperty('--c2', col(t[2]));
    document.documentElement.style.setProperty('--border', col(t[3]));
    document.documentElement.style.setProperty('--text', '#fff');
    $('dh').textContent = diff;
}
apply();

/* =========================================================
   RESIZE
========================================================= */
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

/* =========================================================
   POSIÇÃO ALEATÓRIA / TEMPO
========================================================= */
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
        for (let dy = 0; dy < escala; dy++) {
            base.push({
                x: p.x + dx,
                y: p.y + dy
            });
        }
    }
    return base.map(normalizarCelula);
}
function occupied(p) {
    return s.some(q => celulasOcupadasPorSegmento(q).some(c => c.x === p.x && c.y === p.y)) ||
        isObstacle(p) ||
        foods.some(f => f.x === p.x && f.y === p.y) ||
        (rgbOn && rgb && rgb.x === p.x && rgb.y === p.y);
}

/* =========================================================
   MODO OBSTÁCULOS
========================================================= */
function ajustarObstaculos() {
    obstacles.forEach(chave => {
        const [ox, oy] = chave.split(',').map(Number);
        if (ox >= mapSize || oy >= mapSize) obstacles.delete(chave);
    });
    const centro = Math.floor(mapSize / 2);
    const qtdAlvo = Math.floor(mapSize * mapSize * 0.025);
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

/* =========================================================
   VELOCIDADE
========================================================= */
function velocidadeAtual() {
    const base = D[diff][0];
    const fatorNivel = (mapMode === 'Velocidade') ? 1.4 : 0.8;
    let bonus = (level - 1) * fatorNivel;
    bonus += velocidadeExtraApple;
    if (efeitoTemporario && efeitoTemporario.tipo === 'velocidade' && gameTime < efeitoTemporario.ate) bonus += 6;
    return Math.min(base + bonus, base + 18);
}

/* =========================================================
   MODO CAOS
========================================================= */
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

/* =========================================================
   MODO ESPELHO
========================================================= */
function direcaoAtiva(d) {
    const espelhoAtivo = mapMode === 'Espelho' ||
        (efeitoTemporario && efeitoTemporario.tipo === 'espelho' && gameTime < efeitoTemporario.ate);
    if (!espelhoAtivo) return d;
    const inverso = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
    return inverso[d];
}

/* =========================================================
   SPAWN MAÇÃ / RGB
========================================================= */
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

/* =========================================================
   RESET
========================================================= */
function reset() {
    mapSize = MAPA_INICIAL;
    const c = Math.floor(mapSize / 2), r = Math.floor(mapSize / 2);
    const escala = escalaAtual();
    s = [
        { x: c, y: r },
        { x: c - escala, y: r },
        { x: c - escala * 2, y: r }
    ];
    prevS = s.map(seg => ({ ...seg })); // evita "salto" visual no primeiro frame
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

/* =========================================================
   DIREÇÃO / TECLADO / GESTOS / D-PAD
========================================================= */
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
cv.ontouchstart = e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    swipeAtivo = false;
};
cv.ontouchmove = e => {
    e.preventDefault();
    if (swipeAtivo) return;
    const x = e.touches[0].clientX - sx;
    const y = e.touches[0].clientY - sy;
    if (Math.max(Math.abs(x), Math.abs(y)) < 20) return;
    if (Math.abs(x) > Math.abs(y)) {
        setDir(direcaoAtiva(x > 0 ? 'RIGHT' : 'LEFT'));
    } else {
        setDir(direcaoAtiva(y > 0 ? 'DOWN' : 'UP'));
    }
    swipeAtivo = true;
};
cv.ontouchend = e => {
    e.preventDefault();
    swipeAtivo = false;
};
function configurarDpad() {
    const botoes = [
        { id: 'dpadUp', direcao: 'UP' },
        { id: 'dpadDown', direcao: 'DOWN' },
        { id: 'dpadLeft', direcao: 'LEFT' },
        { id: 'dpadRight', direcao: 'RIGHT' }
    ];
    botoes.forEach(b => {
        const btn = $(b.id);
        if (!btn) return;
        const acionar = e => {
            e.preventDefault();
            setDir(direcaoAtiva(b.direcao));
        };
        btn.addEventListener('pointerdown', acionar);
    });
}
configurarDpad();

/* =========================================================
   DIMINUIR MAPA
========================================================= */
function shrinkMap() {
    if (mapSize <= MAPA_MINIMO) return;
    mapSize -= 2;
    prepararModoMapa();
    foods = foods.filter(f => f.x < mapSize && f.y < mapSize && !isObstacle(f));
    preencherMacas();
    if (rgbOn && rgb && (rgb.x >= mapSize || rgb.y >= mapSize || isObstacle(rgb))) spawnRgb();
}

/* =========================================================
   MOVIMENTO
========================================================= */
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
        const foraDosLimites =
            celulasOcupadasPorSegmento(h).some(c =>
                c.x < 0 ||
                c.x >= mapSize ||
                c.y < 0 ||
                c.y >= mapSize
            );
        if (foraDosLimites) {
            end();
            return;
        }
    }

    const celulasHead = celulasOcupadasPorSegmento(h);
    const colidiuObstaculo = celulasHead.some(c => isObstacle(c));

    /*
    No modo Gigante (2x), quando a cobra anda uma célula,
    a nova cabeça naturalmente ocupa parte do espaço
    da cabeça anterior.
    Por isso o primeiro segmento antigo é ignorado
    na colisão. Para as outras partes da cobra,
    a colisão continua normal.
    */
    /* No 2x a cabeça também encosta nos segmentos seguintes
       ao fazer CURVAS (o bloco 2x2 da cabeça passa por cima
       dos blocos 2x2 que estão 1 célula atrás na curva).
       Então ignoramos os primeiros segmentos proporcionais
       à escala — a colisão real (corpo de trás, parede,
       obstáculo) continua valendo. */
    const ignoraAte = escala > 1 ? escala * 2 : 0;
    const colidiuCorpo = s.some((p, i) => {
        if (i === 0) return false;
        if (escala > 1 && i <= ignoraAte) return false;
        const celulasCorpo = celulasOcupadasPorSegmento(p);
        return celulasCorpo.some(bc =>
            celulasHead.some(hc =>
                hc.x === bc.x && hc.y === bc.y
            )
        );
    });

    if (colidiuObstaculo || colidiuCorpo) {
        end();
        return;
    }

    s.unshift(h);

    const idxComida = foods.findIndex(f =>
        celulasHead.some(c => c.x === f.x && c.y === f.y)
    );
    if (idxComida !== -1) {
        score += D[diff][1] * MULTIPLICADOR_MACA;
        grow += D[diff][1] * MULTIPLICADOR_MACA;
        coinsThisRun += 2;
        color = C[Math.floor(Math.random() * C.length)];
        if (mapMode === 'Velocidade') {
            velocidadeExtraApple =
                Math.min(velocidadeExtraApple + 0.3, 10);
        }
        foods.splice(idxComida, 1);
        preencherMacas();
        if (!rgbOn && score >= nextRgbScore) {
            rgbOn = true;
            spawnRgb();
            nextRgbScore += 10;
        }
    }

    if (
        rgbOn &&
        rgb &&
        celulasHead.some(c =>
            c.x === rgb.x && c.y === rgb.y
        )
    ) {
        score += 5 * D[diff][1] * MULTIPLICADOR_MACA;
        grow += 5 * D[diff][1] * MULTIPLICADOR_MACA;
        coinsThisRun += 4;
        color = C[Math.floor(Math.random() * C.length)];
        rgbOn = false;
        rgb = null;
        if (foods.length) {
            const idxRealoca =
                Math.floor(Math.random() * foods.length);
            const novaPos = spawnUmaMaca();
            if (novaPos) {
                foods[idxRealoca] = novaPos;
            }
        }
    }

    if (grow > 0) {
        grow--;
    } else {
        s.pop();
    }
}

/* =========================================================
   DESENHAR
========================================================= */
/* Maçã caprichada (igual no jogo e na prévia): corpo
   brilhante, reflexo de luz, cabinho e folha — pulsa
   suavemente. `semGlow` desliga o brilho caro quando há
   muitas maçãs na tela (arena online), aliviando o render. */
function desenharMaca(gM, mx, my, cellM, tempoM, semGlow, hueM) {
    const pulsoM = Math.sin(tempoM / 320 + (mx + my) * 0.35) * 0.5 + 0.5;
    const cxa = mx + cellM / 2;
    const cya = my + cellM * 0.56;
    const raio = cellM * (0.29 + pulsoM * 0.025);
    /* hueM = matiz da maçã colorida (RGB). Sem ele, maçã vermelha. */
    const eRgb = typeof hueM === 'number';
    const hue = eRgb ? hueM : 0;
    if (!semGlow) {
        gM.shadowBlur = cellM * (eRgb ? 0.18 : 0.22 + pulsoM * 0.26);
        gM.shadowColor = eRgb
            ? `hsla(${hue}, 90%, 55%, .8)`
            : 'rgba(255, 45, 45, .8)';
    }
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
    gM.shadowBlur = 0;
    gM.fillStyle = eRgb
        ? `hsla(${(hue + 60) % 360}, 100%, 88%, .5)`
        : 'rgba(255, 255, 255, .48)';
    gM.beginPath();
    gM.ellipse(cxa - raio * 0.34, cya - raio * 0.32, raio * 0.24, raio * 0.15, -0.6, 0, Math.PI * 2);
    gM.fill();
    if (semGlow) return; /* em mapa cheio, cabinho e folha são cortados */
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
    gM.strokeStyle = 'rgba(20, 60, 12, .6)';
    gM.lineWidth = Math.max(1, cellM * 0.02);
    gM.stroke();
}

/* Cenário do tema Cosmos: nebulosas, estrelas titilando,
   buraco negro com disco de acreção girando e um planeta
   distante com anel — tudo animado atrás da partida.
   OTIMIZAÇÃO: os gradientes caros são criados UMA vez
   (cache) e reutilizados a cada quadro; a "respiração"
   das nebulosas passa a usar globalAlpha em vez de
   recriar gradiente. */
let cosmosCache = { chave: '', nebulosas: [], halo: null, nucleo: null, esfera: null, galaxias: [], bhx: 0, bhy: 0, raioB: 0, plx: 0, ply: 0, raioP: 0 };
function desenharCosmos(area, cell) {
    const agora = Date.now();
    const rnd = n => {
        const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
    };
    /* Arredonda as medidas: pixels fracionários oscilam uns
       décimos entre frames e invalidariam o cache TODA hora
       (reconstruindo o cenário 60x/s = crash). */
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
    /* nebulosas que "respiram" — globalAlpha em vez de recriar */
    C.nebulosas.forEach((nb, idxN) => {
        const respira = 1 + Math.sin(agora / 4200 + idxN * 2.1);
        ctx.globalAlpha = 0.75 + respira * 0.12;
        ctx.fillStyle = nb.grad;
        ctx.fillRect(nb.x - nb.r, nb.y - nb.r, nb.r * 2, nb.r * 2);
    });
    ctx.globalAlpha = 1;
    /* estrelas titilando: 70 delas em 3 tamanhos, céu denso */
    for (let st = 0; st < 70; st++) {
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
    /* galáxias distantes: espirais bem pequenas girando */
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
    /* constelações: figuras que se acendem em sequência */
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
    /* estrela cadente cruzando a cada ~9 segundos */
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
    /* cometa com cauda orbitando o centro do mapa */
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
    /* buraco negro com disco de acreção + halo gravitacional */
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
    /* planeta distante com anéis girando e luas orbitando */
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

/* =========================================================
   CENÁRIOS ANIMADOS DOS TEMAS — versão caprichada
   O fundo estático de cada tema (montanhas, silhuetas,
   gradientes, luzes) é desenhado UMA vez em um canvas
   invisível e colado por drawImage a cada quadro. Por
   cima passam só as partículas animadas (chuva, brasas,
   pétalas...). Cenário rico sem pesar no celular.
========================================================= */
const cenarioCache = {};
const rndC = n => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
function novoBaseCenario(tema, area, cell) {
    const S = area.size;
    const bc = document.createElement('canvas');
    bc.width = S; bc.height = S;
    const b = bc.getContext('2d');
    const c = { chave: [tema, Math.round(area.x), Math.round(area.y), Math.round(area.size), Math.round(cell)].join('|'), area, cell, base: bc };
    if (tema === 'Abismo') {
        /* água em camadas de profundidade */
        const agua = b.createLinearGradient(0, 0, 0, S);
        agua.addColorStop(0, 'rgba(8, 34, 62, 1)');
        agua.addColorStop(0.55, 'rgba(4, 20, 40, 1)');
        agua.addColorStop(1, 'rgba(2, 10, 24, 1)');
        b.fillStyle = agua;
        b.fillRect(0, 0, S, S);
        /* feixes de luz descendo da superfície */
        [0.16, 0.4, 0.64, 0.86].forEach((fx, i) => {
            const rx = S * fx;
            const feixe = b.createLinearGradient(rx, 0, rx + S * 0.08, S * 0.72);
            feixe.addColorStop(0, `rgba(120, 215, 255, ${0.16 - i * 0.02})`);
            feixe.addColorStop(1, 'rgba(120, 215, 255, 0)');
            b.fillStyle = feixe;
            b.beginPath();
            b.moveTo(rx - S * 0.012, 0);
            b.lineTo(rx + S * 0.068, 0);
            b.lineTo(rx + S * 0.125, S * 0.72);
            b.lineTo(rx + S * 0.02, S * 0.72);
            b.fill();
        });
        /* rochas do fundo */
        b.fillStyle = 'rgba(5, 13, 19, .95)';
        [[0.08, 0.05], [0.28, 0.035], [0.52, 0.06], [0.78, 0.04], [0.94, 0.055]].forEach(rd => {
            b.beginPath();
            b.ellipse(S * rd[0], S - S * rd[1] * 0.4, S * rd[1] * 1.7, S * rd[1], 0, Math.PI, 0);
            b.fill();
        });
        /* corais em leque com pontinhas brilhantes */
        [0.13, 0.48, 0.9].forEach((cx2, i) => {
            const bx = S * cx2, by = S * 0.985, alt = S * (0.055 + rndC(i) * 0.035);
            b.strokeStyle = 'rgba(13, 42, 50, .95)';
            b.lineWidth = Math.max(2, cell * 0.12);
            for (let br = -2; br <= 2; br++) {
                b.beginPath();
                b.moveTo(bx, by);
                b.quadraticCurveTo(bx + br * alt * 0.3, by - alt * 0.6, bx + br * alt * 0.55, by - alt);
                b.stroke();
                b.fillStyle = 'rgba(90, 230, 235, .85)';
                b.beginPath();
                b.arc(bx + br * alt * 0.55, by - alt, Math.max(1, cell * 0.055), 0, Math.PI * 2);
                b.fill();
            }
        });
        /* conchinhas claras espalhadas */
        for (let q = 0; q < 9; q++) {
            b.fillStyle = 'rgba(150, 200, 210, .28)';
            b.beginPath();
            b.ellipse(S * rndC(q + 90), S * (0.958 + rndC(q) * 0.03), cell * 0.15, cell * 0.07, 0, 0, Math.PI * 2);
            b.fill();
        }
    } else if (tema === 'Vulcao') {
        /* céu quente em camadas */
        const ceu = b.createLinearGradient(0, 0, 0, S);
        ceu.addColorStop(0, 'rgba(10, 3, 2, 1)');
        ceu.addColorStop(0.55, 'rgba(30, 8, 4, 1)');
        ceu.addColorStop(1, 'rgba(18, 5, 3, 1)');
        b.fillStyle = ceu;
        b.fillRect(0, 0, S, S);
        /* brilho quente do horizonte */
        const hor = b.createLinearGradient(0, S * 0.52, 0, S);
        hor.addColorStop(0, 'rgba(255, 90, 30, 0)');
        hor.addColorStop(1, 'rgba(255, 90, 30, .17)');
        b.fillStyle = hor;
        b.fillRect(0, S * 0.52, S, S * 0.48);
        /* cordilheira distante em camadas */
        b.fillStyle = 'rgba(28, 9, 7, .9)';
        b.beginPath();
        b.moveTo(0, S * 0.95);
        b.lineTo(S * 0.16, S * 0.6);
        b.lineTo(S * 0.38, S * 0.92);
        b.lineTo(S * 0.6, S * 0.64);
        b.lineTo(S * 0.84, S * 0.93);
        b.lineTo(S, S * 0.68);
        b.lineTo(S, S);
        b.lineTo(0, S);
        b.fill();
        /* vulcão vizinho (fundo) */
        b.fillStyle = 'rgba(16, 5, 4, .95)';
        b.beginPath();
        b.moveTo(S * 0.6, S * 0.94);
        b.lineTo(S * 0.665, S * 0.78);
        b.lineTo(S * 0.7, S * 0.78);
        b.lineTo(S * 0.77, S * 0.94);
        b.fill();
        /* vulcão principal */
        const vx = S * 0.2, vy = S * 0.94, vw = S * 0.38, vh = S * 0.42;
        b.fillStyle = 'rgba(9, 3, 2, .98)';
        b.beginPath();
        b.moveTo(vx, vy);
        b.lineTo(vx + vw * 0.42, vy - vh);
        b.lineTo(vx + vw * 0.58, vy - vh);
        b.lineTo(vx + vw, vy);
        b.fill();
        /* rio de lava escorrendo da cratera até a piscina */
        const rio = [
            [vx + vw * 0.5, vy - vh],
            [vx + vw * 0.62, vy - vh * 0.55],
            [vx + vw * 0.56, vy - vh * 0.2],
            [vx + vw * 0.7, vy + S * 0.02],
            [vx + vw * 0.9, S * 0.99]
        ];
        c.rio = rio;
        const rioG = b.createLinearGradient(0, vy - vh, 0, S);
        rioG.addColorStop(0, '#ffe27a');
        rioG.addColorStop(0.4, '#ff9a3c');
        rioG.addColorStop(1, '#e0400f');
        b.lineCap = 'round';
        b.lineJoin = 'round';
        b.strokeStyle = rioG;
        b.lineWidth = Math.max(3, cell * 0.5);
        b.beginPath();
        b.moveTo(rio[0][0], rio[0][1]);
        b.quadraticCurveTo(rio[1][0], rio[1][1], rio[2][0], rio[2][1]);
        b.quadraticCurveTo(rio[3][0], rio[3][1], rio[4][0], rio[4][1]);
        b.stroke();
        /* halo quente em volta do rio */
        b.strokeStyle = 'rgba(255, 120, 30, .18)';
        b.lineWidth = Math.max(8, cell * 1.4);
        b.stroke();
        /* piscina de lava no rodapé */
        const pisc = b.createLinearGradient(0, S * 0.93, 0, S);
        pisc.addColorStop(0, 'rgba(255, 130, 30, .85)');
        pisc.addColorStop(0.35, 'rgba(210, 60, 10, .55)');
        pisc.addColorStop(1, 'rgba(110, 20, 5, 0)');
        b.fillStyle = pisc;
        b.fillRect(0, S * 0.93, S, S * 0.07);
        /* rachaduras no chão (coords guardadas p/ brilho pulsar) */
        c.rachaduras = [];
        for (let r2 = 0; r2 < 6; r2++) {
            const rx2 = S * (0.08 + r2 * 0.15 + rndC(r2) * 0.05);
            const ry2 = S * (0.5 + rndC(r2 + 5) * 0.38);
            const pts = [[rx2, ry2], [rx2 + S * 0.045, ry2 + S * 0.02], [rx2 + S * 0.09, ry2 - S * 0.015]];
            c.rachaduras.push(pts);
            b.strokeStyle = 'rgba(30, 8, 4, .95)';
            b.lineWidth = Math.max(1.5, cell * 0.1);
            b.beginPath();
            b.moveTo(pts[0][0], pts[0][1]);
            b.lineTo(pts[1][0], pts[1][1]);
            b.lineTo(pts[2][0], pts[2][1]);
            b.stroke();
        }
        /* halo da cratera (gradiente dinâmico, no ctx principal) */
        c.haloCratera = ctx.createRadialGradient(vx + vw * 0.5, vy - vh, 0, vx + vw * 0.5, vy - vh, vw * 0.8);
        c.haloCratera.addColorStop(0, 'rgba(255, 150, 45, .4)');
        c.haloCratera.addColorStop(1, 'rgba(255, 150, 45, 0)');
        c.crateraXY = [area.x + vx + vw * 0.5, area.y + vy - vh];
        c.nuvensFumaca = [0, 1, 2, 3].map(f => ({ fase: f / 4 }));
    } else if (tema === 'Tempestade') {
        /* céu carregado */
        const ceu = b.createLinearGradient(0, 0, 0, S);
        ceu.addColorStop(0, 'rgba(8, 10, 18, 1)');
        ceu.addColorStop(0.5, 'rgba(15, 19, 31, 1)');
        ceu.addColorStop(1, 'rgba(19, 25, 40, 1)');
        b.fillStyle = ceu;
        b.fillRect(0, 0, S, S);
        /* massas de nuvem escuras */
        [[0.14, 0.08, 0.3], [0.45, 0.05, 0.36], [0.72, 0.1, 0.32], [0.92, 0.06, 0.26], [0.3, 0.16, 0.24]].forEach(nb => {
            const nx = S * nb[0], ny = S * nb[1], nr = S * nb[2];
            const ng = b.createRadialGradient(nx, ny, 0, nx, ny, nr);
            ng.addColorStop(0, 'rgba(56, 68, 98, .55)');
            ng.addColorStop(0.6, 'rgba(44, 54, 80, .3)');
            ng.addColorStop(1, 'rgba(44, 54, 80, 0)');
            b.fillStyle = ng;
            b.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
        });
        /* colinas distantes */
        b.fillStyle = 'rgba(7, 9, 16, .95)';
        b.beginPath();
        b.moveTo(0, S * 0.9);
        b.quadraticCurveTo(S * 0.25, S * 0.82, S * 0.5, S * 0.89);
        b.quadraticCurveTo(S * 0.75, S * 0.95, S, S * 0.87);
        b.lineTo(S, S);
        b.lineTo(0, S);
        b.fill();
        /* capim seco no rodapé (base estática) */
        b.strokeStyle = 'rgba(4, 6, 11, .95)';
        b.lineWidth = Math.max(1, cell * 0.07);
        for (let gr = 0; gr < 42; gr++) {
            const gx = S * rndC(gr + 1), gh = cell * (0.5 + rndC(gr + 20) * 0.9);
            const incl = (rndC(gr + 40) - 0.5) * cell * 0.4;
            b.beginPath();
            b.moveTo(gx, S * 0.985);
            b.lineTo(gx + incl, S * 0.985 - gh);
            b.stroke();
        }
        /* poças refletindo o céu */
        [[0.2, 0.955], [0.55, 0.97], [0.85, 0.96]].forEach(pp => {
            b.fillStyle = 'rgba(70, 92, 135, .22)';
            b.beginPath();
            b.ellipse(S * pp[0], S * pp[1], S * 0.045, S * 0.008, 0, 0, Math.PI * 2);
            b.fill();
        });
        /* nuvens que deslizam (gradientes no ctx principal) */
        c.nuvens = [[0.25, 0.1, 0.3], [0.68, 0.07, 0.34]].map((nb, i) => {
            const nx = area.x + S * nb[0];
            const rg = ctx.createRadialGradient(nx, area.y + S * nb[1], 0, nx, area.y + S * nb[1], S * nb[2]);
            rg.addColorStop(0, `rgba(70, 84, 118, ${0.4 - i * 0.08})`);
            rg.addColorStop(1, 'rgba(70, 84, 118, 0)');
            return { grad: rg, x: nx, y: area.y + S * nb[1], r: S * nb[2], vel: 0.008 + i * 0.004 };
        });
        /* névoa rasteira (gradiente no ctx principal) */
        c.nevoa = ctx.createLinearGradient(0, area.y + S * 0.72, 0, area.y + S);
        c.nevoa.addColorStop(0, 'rgba(105, 130, 180, 0)');
        c.nevoa.addColorStop(1, 'rgba(105, 130, 180, .18)');
        /* capim que balança (8 hastes vivas) */
        c.gramaViva = [0, 1, 2, 3, 4, 5, 6, 7].map(gv => ({
            x: S * (0.05 + gv * 0.13 + rndC(gv) * 0.06),
            h: cell * (0.9 + rndC(gv + 9) * 0.7),
            fase: gv * 1.4
        }));
    } else if (tema === 'Retro') {
        /* céu synthwave: roxo → horizonte quente */
        const ceu = b.createLinearGradient(0, 0, 0, S * 0.62);
        ceu.addColorStop(0, 'rgba(14, 4, 36, 1)');
        ceu.addColorStop(0.55, 'rgba(38, 8, 62, 1)');
        ceu.addColorStop(1, 'rgba(80, 18, 78, 1)');
        b.fillStyle = ceu;
        b.fillRect(0, 0, S, S * 0.62);
        /* chão abaixo do horizonte */
        b.fillStyle = 'rgba(16, 4, 32, 1)';
        b.fillRect(0, S * 0.62, S, S * 0.38);
        /* reflexo do sol na pista */
        const ref = b.createLinearGradient(0, S * 0.62, 0, S);
        ref.addColorStop(0, 'rgba(255, 90, 140, .14)');
        ref.addColorStop(1, 'rgba(255, 90, 140, 0)');
        b.fillStyle = ref;
        b.fillRect(S * 0.4, S * 0.62, S * 0.2, S * 0.38);
        /* estrelas fixas */
        for (let st = 0; st < 34; st++) {
            b.fillStyle = `rgba(255, 225, 250, ${0.2 + rndC(st) * 0.5})`;
            b.fillRect(S * rndC(st + 1), S * rndC(st + 31) * 0.5, Math.max(1, cell * 0.07), Math.max(1, cell * 0.07));
        }
        /* sol listrado */
        const solX = S * 0.5, solY = S * 0.34, solR = S * 0.16;
        const sol = b.createLinearGradient(0, solY - solR, 0, solY + solR);
        sol.addColorStop(0, '#ffe86b');
        sol.addColorStop(0.5, '#ff8a5c');
        sol.addColorStop(1, '#ff3d8b');
        b.save();
        b.beginPath();
        b.arc(solX, solY, solR, 0, Math.PI * 2);
        b.clip();
        b.fillStyle = sol;
        b.fillRect(solX - solR, solY - solR, solR * 2, solR * 2);
        b.fillStyle = 'rgba(40, 8, 60, .95)';
        for (let l = 0; l < 5; l++) {
            b.fillRect(solX - solR, solY + solR * (0.12 + l * 0.2), solR * 2, solR * (0.045 + l * 0.032));
        }
        b.restore();
        /* halo do sol */
        const halo = b.createRadialGradient(solX, solY, solR * 0.8, solX, solY, solR * 2);
        halo.addColorStop(0, 'rgba(255, 110, 150, .22)');
        halo.addColorStop(1, 'rgba(255, 110, 150, 0)');
        b.fillStyle = halo;
        b.fillRect(solX - solR * 2, solY - solR * 2, solR * 4, solR * 4);
        c.solXY = [area.x + solX, area.y + solY];
        c.solR = solR;
        /* montanhas em 3 camadas */
        [['rgba(52, 12, 82, .95)', 0.2, 0.52, 0.34], ['rgba(34, 8, 58, .97)', 0.55, 0.74, 0.28], ['rgba(22, 5, 42, 1)', 0.82, 0.95, 0.24]].forEach(m => {
            b.fillStyle = m[0];
            b.beginPath();
            b.moveTo(S * (m[1] - 0.18), S * 0.63);
            b.lineTo(S * m[1], S * 0.63 - S * m[3] * 0.5);
            b.lineTo(S * (m[1] + 0.18), S * 0.63);
            b.fill();
        });
        /* palmeiras silhueta nas margens */
        [[0.06, 1], [0.93, 0.85]].forEach(pp => {
            const px2 = S * pp[0], escala = pp[1];
            const topo = S * 0.62 - S * 0.24 * escala;
            b.strokeStyle = 'rgba(10, 2, 24, 1)';
            b.lineCap = 'round';
            b.lineWidth = Math.max(3, cell * 0.3);
            b.beginPath();
            b.moveTo(px2, S * 0.66);
            b.quadraticCurveTo(px2 + S * 0.02 * escala, S * 0.5, px2 + S * 0.05 * escala, topo);
            b.stroke();
            b.lineWidth = Math.max(2, cell * 0.16);
            for (let fr = 0; fr < 6; fr++) {
                const ang = Math.PI * (0.15 + fr * 0.14);
                b.beginPath();
                b.moveTo(px2 + S * 0.05 * escala, topo);
                b.quadraticCurveTo(
                    px2 + S * 0.05 * escala + Math.cos(ang) * S * 0.09 * escala,
                    topo + Math.sin(ang) * S * 0.06 * escala,
                    px2 + S * 0.05 * escala + Math.cos(ang) * S * 0.13 * escala,
                    topo + Math.sin(ang) * S * 0.1 * escala + S * 0.02
                );
                b.stroke();
            }
        });
        /* scanlines de CRT */
        b.fillStyle = 'rgba(0, 0, 0, .05)';
        for (let sl = 0; sl < S; sl += 4) b.fillRect(0, sl, S, 1);
        /* pulso do sol (overlay dinâmico) */
        c.solPulso = ctx.createRadialGradient(c.solXY[0], c.solXY[1], solR, c.solXY[0], c.solXY[1], solR * 1.6);
        c.solPulso.addColorStop(0, 'rgba(255, 120, 160, .18)');
        c.solPulso.addColorStop(1, 'rgba(255, 120, 160, 0)');
    } else if (tema === 'Sakura') {
        /* entardecer de ameixa */
        const ceu = b.createLinearGradient(0, 0, 0, S);
        ceu.addColorStop(0, 'rgba(26, 9, 32, 1)');
        ceu.addColorStop(0.55, 'rgba(60, 21, 64, 1)');
        ceu.addColorStop(1, 'rgba(38, 13, 42, 1)');
        b.fillStyle = ceu;
        b.fillRect(0, 0, S, S);
        /* estrelas fracas no topo */
        for (let st = 0; st < 14; st++) {
            b.fillStyle = `rgba(255, 235, 250, ${0.15 + rndC(st) * 0.3})`;
            b.fillRect(S * rndC(st + 1), S * rndC(st + 21) * 0.3, Math.max(1, cell * 0.06), Math.max(1, cell * 0.06));
        }
        /* monte Fuji ao fundo */
        b.fillStyle = 'rgba(32, 12, 36, .96)';
        b.beginPath();
        b.moveTo(S * 0.12, S * 0.88);
        b.lineTo(S * 0.32, S * 0.5);
        b.lineTo(S * 0.52, S * 0.88);
        b.fill();
        /* neve no pico (com serrilhado) */
        b.fillStyle = 'rgba(246, 228, 242, .9)';
        b.beginPath();
        b.moveTo(S * 0.32, S * 0.5);
        b.lineTo(S * 0.275, S * 0.585);
        b.lineTo(S * 0.29, S * 0.57);
        b.lineTo(S * 0.305, S * 0.59);
        b.lineTo(S * 0.32, S * 0.575);
        b.lineTo(S * 0.335, S * 0.595);
        b.lineTo(S * 0.35, S * 0.568);
        b.lineTo(S * 0.365, S * 0.585);
        b.fill();
        /* névoa na base do Fuji */
        const nevoaF = b.createLinearGradient(0, S * 0.78, 0, S * 0.9);
        nevoaF.addColorStop(0, 'rgba(255, 160, 195, 0)');
        nevoaF.addColorStop(0.5, 'rgba(255, 160, 195, .16)');
        nevoaF.addColorStop(1, 'rgba(255, 160, 195, 0)');
        b.fillStyle = nevoaF;
        b.fillRect(0, S * 0.78, S, S * 0.12);
        /* portal torii à direita */
        b.fillStyle = 'rgba(72, 15, 28, .96)';
        b.fillRect(S * 0.605, S * 0.76, S * 0.02, S * 0.2);
        b.fillRect(S * 0.795, S * 0.76, S * 0.02, S * 0.2);
        /* viga do topo com pontas erguidas */
        b.beginPath();
        b.moveTo(S * 0.575, S * 0.765);
        b.quadraticCurveTo(S * 0.705, S * 0.735, S * 0.835, S * 0.765);
        b.lineTo(S * 0.83, S * 0.782);
        b.quadraticCurveTo(S * 0.705, S * 0.754, S * 0.58, S * 0.782);
        b.fill();
        /* viga do meio */
        b.fillRect(S * 0.59, S * 0.815, S * 0.245, S * 0.012);
        /* chão */
        b.fillStyle = 'rgba(22, 7, 20, .98)';
        b.fillRect(0, S * 0.955, S, S * 0.045);
        /* pétalas caídas no chão */
        for (let pc = 0; pc < 14; pc++) {
            b.fillStyle = `rgba(255, ${170 + Math.floor(rndC(pc) * 40)}, 205, .3)`;
            b.beginPath();
            b.ellipse(S * rndC(pc + 60), S * (0.962 + rndC(pc + 80) * 0.03), cell * 0.16, cell * 0.06, rndC(pc) * 3, 0, Math.PI * 2);
            b.fill();
        }
        /* brilho das lanternas (gradiente no ctx principal) */
        c.lanterna = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 2);
        c.lanterna.addColorStop(0, 'rgba(255, 190, 110, .4)');
        c.lanterna.addColorStop(1, 'rgba(255, 190, 110, 0)');
        /* vaga-lumes (gradiente no ctx principal) */
        c.vagalume = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 1.4);
        c.vagalume.addColorStop(0, 'rgba(255, 235, 150, .55)');
        c.vagalume.addColorStop(1, 'rgba(255, 235, 150, 0)');
        /* galho de cerejeira no topo */
        c.galho = {
            x0: area.x + S * 0.02, y0: area.y + S * 0.07,
            cx: area.x + S * 0.2, cy: area.y + S * 0.015,
            x1: area.x + S * 0.42, y1: area.y + S * 0.15
        };
        c.flores = [0, 1, 2, 3, 4, 5].map(i => ({
            x: area.x + S * (0.07 + i * 0.062),
            y: area.y + S * (0.06 + rndC(i + 3) * 0.09),
            r: cell * (0.15 + rndC(i) * 0.08)
        }));
    }
    return c;
}
function cacheCenario(tema, area, cell) {
    const chave = [tema, Math.round(area.x), Math.round(area.y), Math.round(area.size), Math.round(cell)].join('|');
    const existente = cenarioCache[tema];
    if (existente && existente.chave === chave) return existente;
    const c = novoBaseCenario(tema, area, cell);
    if (tema === 'Abismo') {
        c.aguaViva = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 1.1);
        c.aguaViva.addColorStop(0, 'rgba(180, 240, 255, .5)');
        c.aguaViva.addColorStop(0.7, 'rgba(120, 180, 255, .22)');
        c.aguaViva.addColorStop(1, 'rgba(120, 180, 255, 0)');
        c.feixeVivo = (() => {
            const fx = area.x + area.size * 0.3;
            const rg = ctx.createLinearGradient(fx, area.y, fx + area.size * 0.1, area.y + area.size * 0.75);
            rg.addColorStop(0, 'rgba(140, 225, 255, .14)');
            rg.addColorStop(1, 'rgba(140, 225, 255, 0)');
            return { grad: rg, x: fx, w: area.size * 0.11 };
        })();
    } else if (tema === 'Sakura') {
        c.lanterna = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 2);
        c.lanterna.addColorStop(0, 'rgba(255, 190, 110, .4)');
        c.lanterna.addColorStop(1, 'rgba(255, 190, 110, 0)');
        c.vagalume = ctx.createRadialGradient(0, 0, 0, 0, 0, cell * 1.4);
        c.vagalume.addColorStop(0, 'rgba(255, 235, 150, .55)');
        c.vagalume.addColorStop(1, 'rgba(255, 235, 150, 0)');
        c.galho = {
            x0: area.x + area.size * 0.02, y0: area.y + area.size * 0.07,
            cx: area.x + area.size * 0.2, cy: area.y + area.size * 0.015,
            x1: area.x + area.size * 0.42, y1: area.y + area.size * 0.15
        };
        c.flores = [0, 1, 2, 3, 4, 5].map(i => ({
            x: area.x + area.size * (0.07 + i * 0.062),
            y: area.y + area.size * (0.06 + rndC(i + 3) * 0.09),
            r: cell * (0.15 + rndC(i) * 0.08)
        }));
    }
    cenarioCache[tema] = c;
    return c;
}
function desenharAbismo(area, cell, agora) {
    const c = cacheCenario('Abismo', area, cell);
    ctx.drawImage(c.base, area.x, area.y);
    /* feixe de luz vivo deslizando */
    const deslF = Math.sin(agora / 4200) * area.size * 0.06;
    ctx.fillStyle = c.feixeVivo.grad;
    ctx.fillRect(c.feixeVivo.x + deslF, area.y, c.feixeVivo.w, area.size * 0.75);
    /* bolhas subindo */
    for (let bo = 0; bo < 20; bo++) {
        const vel = 0.028 + rndC(bo + 60) * 0.03;
        const prog = ((agora / 1000 * vel + rndC(bo)) % 1);
        const bx = area.x + area.size * rndC(bo + 10) + Math.sin(agora / 900 + bo) * cell * 0.6;
        const by = area.y + area.size * (1 - prog);
        const raio = Math.max(1, cell * (0.05 + rndC(bo + 20) * 0.08));
        ctx.strokeStyle = `rgba(190, 235, 255, ${0.25 + prog * 0.35})`;
        ctx.lineWidth = Math.max(1, cell * 0.03);
        ctx.beginPath();
        ctx.arc(bx, by, raio, 0, Math.PI * 2);
        ctx.stroke();
    }
    /* cardumes: dois grupos de peixes */
    for (let grupo = 0; grupo < 2; grupo++) {
        for (let p = 0; p < 4; p++) {
            const cicloP = ((agora / (13000 + grupo * 6000) + p * 0.06 + grupo * 0.4) % 1);
            const px2 = area.x + cicloP * area.size * 1.25 - area.size * 0.12;
            const py2 = area.y + area.size * (0.18 + grupo * 0.2 + p * 0.035) + Math.sin(agora / 1200 + p * 3 + grupo) * cell * 0.7;
            const virado = Math.cos(agora / (13000 + grupo * 6000) * Math.PI * 2) > 0 ? 1 : -1;
            ctx.fillStyle = `rgba(40, 110, 150, ${0.8 - p * 0.1})`;
            ctx.beginPath();
            ctx.ellipse(px2, py2, cell * 0.4, cell * 0.16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px2 - virado * cell * 0.4, py2);
            ctx.lineTo(px2 - virado * cell * 0.68, py2 - cell * 0.14);
            ctx.lineTo(px2 - virado * cell * 0.68, py2 + cell * 0.14);
            ctx.fill();
        }
    }
    /* águas-vivas pulsando */
    for (let j = 0; j < 4; j++) {
        const jx = area.x + area.size * (0.2 + (j % 2) * 0.42 + Math.floor(j / 2) * 0.14) + Math.sin(agora / 2100 + j * 2) * cell * 1.2;
        const jy = area.y + area.size * (0.25 + j * 0.13) + Math.sin(agora / 1700 + j) * cell * 0.7;
        const puls = 1 + Math.sin(agora / 800 + j) * 0.12;
        ctx.save();
        ctx.translate(jx, jy);
        ctx.fillStyle = c.aguaViva;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 1.1 * puls, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190, 240, 255, .35)';
        ctx.lineWidth = Math.max(1, cell * 0.03);
        for (let tz = 0; tz < 3; tz++) {
            ctx.beginPath();
            ctx.moveTo((tz - 1) * cell * 0.3, cell * 0.3 * puls);
            ctx.quadraticCurveTo((tz - 1) * cell * 0.5 + Math.sin(agora / 600 + tz) * cell * 0.2, cell * 0.9, (tz - 1) * cell * 0.35, cell * 1.3);
            ctx.stroke();
        }
        ctx.restore();
    }
    /* baleia gigante atravessando o fundo */
    const cicloB = (agora / 60000) % 1;
    const bx2 = area.x + cicloB * area.size * 1.4 - area.size * 0.2;
    const by2 = area.y + area.size * 0.42 + Math.sin(agora / 5000) * cell * 1.2;
    const rabo = Math.sin(agora / 900) * cell * 0.35;
    ctx.fillStyle = 'rgba(10, 26, 42, .88)';
    ctx.beginPath();
    ctx.ellipse(bx2, by2, cell * 2.6, cell * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    /* rabo */
    ctx.beginPath();
    ctx.moveTo(bx2 - cell * 2.4, by2);
    ctx.quadraticCurveTo(bx2 - cell * 3.1, by2 - cell * 0.5 + rabo, bx2 - cell * 3.3, by2 - cell * 0.7 + rabo);
    ctx.quadraticCurveTo(bx2 - cell * 2.9, by2 + rabo * 0.5, bx2 - cell * 2.4, by2);
    ctx.fill();
    /* barbatana */
    ctx.beginPath();
    ctx.moveTo(bx2 + cell * 0.3, by2 + cell * 0.4);
    ctx.quadraticCurveTo(bx2 + cell * 0.1, by2 + cell * 1.1, bx2 - cell * 0.4, by2 + cell * 0.9);
    ctx.fill();
    /* barriga mais clara */
    ctx.fillStyle = 'rgba(60, 100, 130, .35)';
    ctx.beginPath();
    ctx.ellipse(bx2 + cell * 0.2, by2 + cell * 0.35, cell * 2.1, cell * 0.4, 0, 0, Math.PI);
    ctx.fill();
    /* olho */
    ctx.fillStyle = 'rgba(200, 235, 255, .8)';
    ctx.beginPath();
    ctx.arc(bx2 + cell * 2.1, by2 - cell * 0.2, Math.max(1, cell * 0.06), 0, Math.PI * 2);
    ctx.fill();
    /* jato d'água de vez em quando */
    const cicloJ = (agora % 9000) / 9000;
    if (cicloJ < 0.08 && cicloB > 0.1 && cicloB < 0.9) {
        ctx.strokeStyle = `rgba(200, 240, 255, ${(0.08 - cicloJ) * 6})`;
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.beginPath();
        ctx.moveTo(bx2 + cell * 1.6, by2 - cell * 0.7);
        ctx.quadraticCurveTo(bx2 + cell * 1.8, by2 - cell * 1.5, bx2 + cell * 2.1, by2 - cell * 1.7);
        ctx.stroke();
    }
    /* algas balançando no rodapé */
    [[0.07, 0], [0.15, 1.7], [0.87, 3.4], [0.95, 5.1]].forEach(al => {
        const ax = area.x + area.size * al[0], altura = area.size * (0.13 + rndC(al[1]) * 0.09);
        ctx.strokeStyle = 'rgba(18, 105, 85, .6)';
        ctx.lineWidth = Math.max(1.5, cell * 0.1);
        ctx.beginPath();
        ctx.moveTo(ax, area.y + area.size);
        for (let seg = 1; seg <= 4; seg++) {
            const yy = area.y + area.size - altura * seg / 4;
            const onda = Math.sin(agora / 1400 + al[1] + seg) * cell * 0.38 * seg / 4;
            ctx.lineTo(ax + onda, yy);
        }
        ctx.stroke();
    });
}
function desenharVulcao(area, cell, agora) {
    const c = cacheCenario('Vulcao', area, cell);
    ctx.drawImage(c.base, area.x, area.y);
    /* halo pulsante da cratera */
    ctx.globalAlpha = 0.7 + Math.sin(agora / 700) * 0.3;
    ctx.fillStyle = c.haloCratera;
    ctx.fillRect(c.crateraXY[0] - area.size * 0.15, c.crateraXY[1] - area.size * 0.15, area.size * 0.3, area.size * 0.3);
    ctx.globalAlpha = 1;
    /* brilho do rio de lava pulsando */
    const rio = c.rio;
    ctx.globalAlpha = 0.25 + Math.sin(agora / 800) * 0.15;
    ctx.strokeStyle = 'rgba(255, 170, 60, .5)';
    ctx.lineWidth = Math.max(6, cell * 0.9);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rio[0][0], rio[0][1]);
    ctx.quadraticCurveTo(rio[1][0], rio[1][1], rio[2][0], rio[2][1]);
    ctx.quadraticCurveTo(rio[3][0], rio[3][1], rio[4][0], rio[4][1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    /* rachaduras acendendo e apagando */
    c.rachaduras.forEach((pts, r2) => {
        const brilho = 0.3 + Math.sin(agora / 900 + r2 * 2.1) * 0.3;
        if (brilho < 0.12) return;
        ctx.strokeStyle = `rgba(255, 110, 30, ${brilho})`;
        ctx.lineWidth = Math.max(1, cell * 0.07);
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(pts[1][0], pts[1][1]);
        ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.stroke();
    });
    /* coluna de fumaça subindo */
    c.nuvensFumaca.forEach((nf, f) => {
        const progF = ((agora / 11000 + nf.fase) % 1);
        const fx = area.x + area.size * 0.296 + Math.sin(agora / 2200 + f * 2) * cell * (0.8 + progF * 2.2);
        const fy = area.y + area.size * 0.52 - progF * area.size * 0.42;
        ctx.fillStyle = `rgba(110, 100, 108, ${0.2 * (1 - progF)})`;
        ctx.beginPath();
        ctx.arc(fx, fy, cell * (0.7 + progF * 2.1), 0, Math.PI * 2);
        ctx.fill();
    });
    /* brasas subindo pelo mapa */
    for (let e = 0; e < 24; e++) {
        const vel = 0.03 + rndC(e + 90) * 0.045;
        const prog = ((agora / 1000 * vel + rndC(e)) % 1);
        const ex = area.x + area.size * rndC(e + 30) + Math.sin(agora / 700 + e * 2) * cell * 0.9;
        const ey = area.y + area.size * (1 - prog);
        const piscaE = 0.55 + Math.sin(agora / 200 + e * 3) * 0.35;
        ctx.fillStyle = `rgba(255, ${120 + Math.floor(rndC(e) * 90)}, 40, ${piscaE * (1 - prog * 0.55)})`;
        ctx.fillRect(ex, ey, Math.max(1.2, cell * 0.08), Math.max(1.2, cell * 0.08));
    }
    /* morcegos passando longe */
    for (let m2 = 0; m2 < 2; m2++) {
        const cicloM = ((agora / 17000 + m2 * 0.5) % 1);
        const mx = area.x + cicloM * area.size * 1.2 - area.size * 0.1;
        const my = area.y + area.size * (0.14 + m2 * 0.06) + Math.sin(agora / 800 + m2) * cell * 0.3;
        const bate = Math.sin(agora / 120 + m2 * 2) * cell * 0.14;
        ctx.strokeStyle = 'rgba(8, 3, 2, .9)';
        ctx.lineWidth = Math.max(1, cell * 0.07);
        ctx.beginPath();
        ctx.moveTo(mx - cell * 0.2, my - bate);
        ctx.lineTo(mx, my);
        ctx.lineTo(mx + cell * 0.2, my - bate);
        ctx.stroke();
    }
}
function desenharTempestade(area, cell, agora) {
    const c = cacheCenario('Tempestade', area, cell);
    ctx.drawImage(c.base, area.x, area.y);
    /* nuvens deslizando */
    c.nuvens.forEach(nb => {
        const desl = (agora * nb.vel) % (area.size * 1.6);
        ctx.fillStyle = nb.grad;
        ctx.fillRect(nb.x - nb.r + desl - area.size * 0.3, nb.y - nb.r, nb.r * 2, nb.r * 2);
    });
    /* névoa rasteira ondulando */
    const ondaN = Math.sin(agora / 2600) * area.size * 0.015;
    ctx.fillStyle = c.nevoa;
    ctx.fillRect(area.x, area.y + area.size * 0.72 + ondaN, area.size, area.size * 0.28);
    /* chuva forte com vento */
    const tChuva = agora / 1000;
    const vento = cell * 0.18;
    for (let g2 = 0; g2 < 60; g2++) {
        const vel = 0.9 + rndC(g2 + 80) * 0.5;
        const prog = ((tChuva * vel + rndC(g2)) % 1);
        const gx = area.x + area.size * rndC(g2 + 40) + prog * vento * 6;
        const gy = area.y + area.size * prog;
        const comp = cell * (0.7 + vel * 0.35);
        ctx.strokeStyle = `rgba(165, 200, 255, ${0.3 + rndC(g2) * 0.24})`;
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.beginPath();
        ctx.moveTo(gx - vento, gy - comp);
        ctx.lineTo(gx, gy);
        ctx.stroke();
    }
    /* relâmpago duplo ramificado a cada ~4.5s */
    const cicloR = agora % 4500;
    if (cicloR < 420) {
        const forca = 1 - cicloR / 420;
        const seedR = Math.floor(agora / 4500);
        const rx2 = area.x + area.size * (0.15 + rndC(seedR + 5) * 0.7);
        let ry2 = area.y + area.size * 0.02;
        const tronco = [[rx2, ry2]];
        ctx.beginPath();
        ctx.moveTo(rx2, ry2);
        for (let zig = 0; zig < 6; zig++) {
            rx2 += (rndC(seedR * 7 + zig) - 0.5) * cell * 2.4;
            ry2 += area.size * 0.08;
            tronco.push([rx2, ry2]);
            ctx.lineTo(rx2, ry2);
        }
        /* brilho largo em volta do raio */
        ctx.strokeStyle = `rgba(200, 215, 255, ${0.25 + forca * 0.2})`;
        ctx.lineWidth = Math.max(5, cell * 0.28);
        ctx.stroke();
        /* tronco principal */
        ctx.strokeStyle = `rgba(240, 246, 255, ${0.7 + forca * 0.3})`;
        ctx.lineWidth = Math.max(2, cell * 0.1);
        ctx.stroke();
        /* ramo secundário */
        if (tronco.length > 3) {
            const [bx3, by3] = tronco[2];
            const lado = rndC(seedR + 3) > 0.5 ? 1 : -1;
            ctx.strokeStyle = `rgba(205, 218, 255, ${0.45 + forca * 0.3})`;
            ctx.lineWidth = Math.max(1, cell * 0.06);
            ctx.beginPath();
            ctx.moveTo(bx3, by3);
            ctx.lineTo(bx3 + cell * 1.6 * lado, by3 + area.size * 0.05);
            ctx.lineTo(bx3 + cell * 2.6 * lado, by3 + area.size * 0.1);
            ctx.stroke();
        }
        /* clarão duplo piscando */
        const pisca = cicloR < 200 ? forca : (cicloR < 300 ? 0.2 : forca * 0.7);
        ctx.fillStyle = `rgba(205, 222, 255, ${pisca * 0.24})`;
        ctx.fillRect(area.x, area.y, area.size, area.size);
    }
    /* capim vivo balançando com o vento */
    c.gramaViva.forEach(gv => {
        const gx2 = area.x + gv.x;
        const inclG = Math.sin(agora / 500 + gv.fase) * cell * 0.3;
        ctx.strokeStyle = 'rgba(6, 9, 15, .95)';
        ctx.lineWidth = Math.max(1, cell * 0.09);
        ctx.beginPath();
        ctx.moveTo(gx2, area.y + area.size * 0.985);
        ctx.quadraticCurveTo(gx2 + inclG * 0.5, area.y + area.size * 0.985 - gv.h * 0.6, gx2 + inclG, area.y + area.size * 0.985 - gv.h);
        ctx.stroke();
    });
    /* respingos nas poças */
    for (let s2 = 0; s2 < 8; s2++) {
        const cicloS = ((tChuva * (0.8 + rndC(s2)) + rndC(s2 + 9)) % 1);
        if (cicloS > 0.96) {
            const sx = area.x + area.size * rndC(s2 + 40);
            const sy = area.y + area.size * 0.98;
            const raioS = (cicloS - 0.96) / 0.04 * cell * 0.55;
            ctx.strokeStyle = 'rgba(165, 200, 255, .4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, raioS, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
}
function desenharRetro(area, cell, agora) {
    const c = cacheCenario('Retro', area, cell);
    ctx.drawImage(c.base, area.x, area.y);
    /* estrelas piscando */
    for (let st2 = 0; st2 < 14; st2++) {
        const sx2 = area.x + rndC(st2 + 51) * area.size;
        const sy2 = area.y + rndC(st2 + 61) * area.size * 0.45;
        const tit = Math.sin(agora / (280 + (st2 % 4) * 110) + st2 * 2.1) * 0.5 + 0.5;
        if (tit < 0.2) continue;
        ctx.fillStyle = `rgba(255, 225, 250, ${tit * 0.8})`;
        ctx.fillRect(sx2, sy2, Math.max(1, cell * 0.08), Math.max(1, cell * 0.08));
    }
    /* pulso do sol */
    ctx.globalAlpha = 0.6 + Math.sin(agora / 1600) * 0.4;
    ctx.fillStyle = c.solPulso;
    ctx.fillRect(c.solXY[0] - c.solR * 1.7, c.solXY[1] - c.solR * 1.7, c.solR * 3.4, c.solR * 3.4);
    ctx.globalAlpha = 1;
    /* grade em perspectiva rolando, com brilho neon */
    const hz = area.y + area.size * 0.62;
    const baseY = area.y + area.size;
    const deslG = (agora / 1400) % 1;
    for (let passada = 0; passada < 2; passada++) {
        const largo = passada === 0 ? Math.max(3, cell * 0.16) : Math.max(1, cell * 0.045);
        ctx.lineWidth = largo;
        for (let v = -6; v <= 6; v++) {
            ctx.strokeStyle = passada === 0 ? 'rgba(255, 60, 190, .1)' : 'rgba(255, 60, 190, .38)';
            ctx.beginPath();
            ctx.moveTo(area.x + area.size * 0.5 + v * cell * 1.6, baseY);
            ctx.lineTo(area.x + area.size * 0.5 + v * cell * 0.14, hz);
            ctx.stroke();
        }
        for (let h2 = 0; h2 < 7; h2++) {
            const prog2 = ((h2 / 7 + deslG) % 1);
            const hy2 = hz + (baseY - hz) * prog2 * prog2;
            ctx.strokeStyle = passada === 0 ? 'rgba(80, 220, 255, .08)' : `rgba(80, 220, 255, ${0.16 + prog2 * 0.28})`;
            ctx.beginPath();
            ctx.moveTo(area.x, hy2);
            ctx.lineTo(area.x + area.size, hy2);
            ctx.stroke();
        }
    }
    /* estrela cadente de vez em quando */
    const cicloCad = agora % 6000;
    if (cicloCad < 700) {
        const progC = cicloCad / 700;
        const seedC = Math.floor(agora / 6000);
        const cx3 = area.x + area.size * (0.15 + rndC(seedC) * 0.5) + progC * area.size * 0.22;
        const cy3 = area.y + area.size * (0.06 + rndC(seedC + 2) * 0.12) + progC * area.size * 0.1;
        ctx.strokeStyle = `rgba(255, 230, 250, ${(1 - progC) * 0.85})`;
        ctx.lineWidth = Math.max(1, cell * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx3, cy3);
        ctx.lineTo(cx3 - area.size * 0.06, cy3 - area.size * 0.03);
        ctx.stroke();
    }
}
function desenharSakura(area, cell, agora) {
    const c = cacheCenario('Sakura', area, cell);
    ctx.drawImage(c.base, area.x, area.y);
    /* pétalas caindo girando */
    for (let p2 = 0; p2 < 22; p2++) {
        const vel = 0.035 + rndC(p2 + 50) * 0.03;
        const prog = ((agora / 1000 * vel + rndC(p2)) % 1);
        const px3 = area.x + area.size * rndC(p2 + 10) + Math.sin(agora / 800 + p2 * 1.9) * cell * 1.4;
        const py3 = area.y + area.size * prog;
        const tamP = cell * (0.13 + rndC(p2 + 20) * 0.1);
        const gira = agora / 600 + p2 * 1.3;
        ctx.save();
        ctx.translate(px3, py3);
        ctx.rotate(gira);
        ctx.fillStyle = `rgba(255, ${165 + Math.floor(rndC(p2) * 50)}, 205, ${0.55 + rndC(p2 + 30) * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, tamP, tamP * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    /* galho de cerejeira */
    ctx.strokeStyle = 'rgba(30, 10, 22, .92)';
    ctx.lineWidth = Math.max(2, cell * 0.18);
    ctx.beginPath();
    ctx.moveTo(c.galho.x0, c.galho.y0);
    ctx.quadraticCurveTo(c.galho.cx, c.galho.cy, c.galho.x1, c.galho.y1);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.5, cell * 0.1);
    ctx.beginPath();
    ctx.moveTo(c.galho.cx, c.galho.cy + cell * 0.1);
    ctx.quadraticCurveTo(c.galho.cx + cell * 1.2, c.galho.cy + cell * 0.4, c.galho.cx + cell * 2.0, c.galho.cy + cell * 0.2);
    ctx.stroke();
    /* flores balançando */
    c.flores.forEach((fl, i) => {
        const balanca = Math.sin(agora / 1500 + i * 2) * cell * 0.05;
        for (let pt = 0; pt < 5; pt++) {
            const ang = pt / 5 * Math.PI * 2 + agora / 4000 + i;
            ctx.fillStyle = `rgba(255, ${175 + (i % 3) * 20}, 210, .92)`;
            ctx.beginPath();
            ctx.ellipse(fl.x + Math.cos(ang) * fl.r * 0.7 + balanca, fl.y + Math.sin(ang) * fl.r * 0.7, fl.r * 0.55, fl.r * 0.38, ang, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255, 220, 130, .95)';
        ctx.beginPath();
        ctx.arc(fl.x + balanca, fl.y, fl.r * 0.22, 0, Math.PI * 2);
        ctx.fill();
    });
    /* lanternas de papel subindo devagar */
    for (let lan = 0; lan < 3; lan++) {
        const cicloL = ((agora / 26000 + lan / 3) % 1);
        const lx2 = area.x + area.size * (0.55 + lan * 0.12) + Math.sin(agora / 1800 + lan * 2.4) * cell * 1.2;
        const ly2 = area.y + area.size * (0.95 - cicloL * 0.6);
        const pulsoL = 0.75 + Math.sin(agora / 700 + lan) * 0.25;
        ctx.save();
        ctx.translate(lx2, ly2);
        ctx.globalAlpha = pulsoL;
        ctx.fillStyle = c.lanterna;
        ctx.fillRect(-cell * 2, -cell * 2, cell * 4, cell * 4);
        ctx.globalAlpha = 1;
        /* corpo do papel */
        ctx.fillStyle = 'rgba(255, 200, 130, .92)';
        ctx.beginPath();
        ctx.ellipse(0, 0, cell * 0.32, cell * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        /* aros escuros */
        ctx.strokeStyle = 'rgba(60, 20, 15, .85)';
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.beginPath();
        ctx.moveTo(-cell * 0.3, -cell * 0.42);
        ctx.lineTo(cell * 0.3, -cell * 0.42);
        ctx.moveTo(-cell * 0.22, cell * 0.42);
        ctx.lineTo(cell * 0.22, cell * 0.42);
        ctx.stroke();
        /* chama dentro */
        ctx.fillStyle = `rgba(255, 240, 180, ${pulsoL})`;
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    /* vaga-lumes piscando */
    for (let v2 = 0; v2 < 8; v2++) {
        const vx2 = area.x + area.size * rndC(v2 + 70) + Math.sin(agora / 1900 + v2 * 2.4) * cell * 2;
        const vy2 = area.y + area.size * (0.35 + rndC(v2 + 80) * 0.5) + Math.cos(agora / 2300 + v2) * cell * 1.2;
        const pisca = Math.max(0, Math.sin(agora / 900 + v2 * 1.7));
        if (pisca < 0.15) continue;
        ctx.save();
        ctx.translate(vx2, vy2);
        ctx.globalAlpha = pisca;
        ctx.fillStyle = c.vagalume;
        ctx.fillRect(-cell * 1.4, -cell * 1.4, cell * 2.8, cell * 2.8);
        ctx.fillStyle = 'rgba(255, 245, 180, .95)';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1, cell * 0.06), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.globalAlpha = 1;
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

    ctx.save();
    ctx.shadowBlur = cell * 0.9;
    ctx.shadowColor = col(t[3]);
    ctx.strokeStyle = col(t[3]);
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.strokeRect(area.x + 1, area.y + 1, area.size - 2, area.size - 2);
    ctx.restore();

    /* Cenário animado: só desenha com mapa medido (na primeira
       carga a tela do jogo está oculta e o mapa dá 0).
       O try/catch garante que um erro no cenário NUNCA congele
       a partida — o resto do frame continua desenhando. */
    if (area.size > 0 && cell > 0) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        try {
            if (theme === 'Cosmos') desenharCosmos(area, cell);
            else if (theme === 'Abismo') desenharAbismo(area, cell, Date.now());
            else if (theme === 'Vulcao') desenharVulcao(area, cell, Date.now());
            else if (theme === 'Tempestade') desenharTempestade(area, cell, Date.now());
            else if (theme === 'Retro') desenharRetro(area, cell, Date.now());
            else if (theme === 'Sakura') desenharSakura(area, cell, Date.now());
        } catch (_e) { console.warn('Erro no cenário:', _e); }
        ctx.restore();
        /* Devolve o tabuleiro por cima do cenário: o quadriculado
           aparece atravessando (o cenário fica 85%) e as linhas
           neon da grade + borda são redesenhadas em cima. */
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = cell * 0.9;
        ctx.shadowColor = col(t[3]);
        ctx.strokeStyle = col(t[3]);
        ctx.lineWidth = Math.max(2, cell * 0.08);
        ctx.strokeRect(area.x + 1, area.y + 1, area.size - 2, area.size - 2);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.13;
        ctx.strokeStyle = col(t[3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i2 = 1; i2 < mapSize; i2++) {
            ctx.moveTo(area.x + i2 * cell, area.y);
            ctx.lineTo(area.x + i2 * cell, area.y + area.size);
            ctx.moveTo(area.x, area.y + i2 * cell);
            ctx.lineTo(area.x + area.size, area.y + i2 * cell);
        }
        ctx.stroke();
        ctx.restore();
    }

    if (obstacles.size) {
        obstacles.forEach(key => {
            const [ox, oy] = key.split(',').map(Number);
            const obsX = area.x + ox * cell, obsY = area.y + oy * cell;
            const obsT = Math.ceil(cell) + 1;
            const pedra = ctx.createLinearGradient(obsX, obsY, obsX, obsY + obsT);
            pedra.addColorStop(0, '#5a5e68');
            pedra.addColorStop(1, '#2e3138');
            ctx.fillStyle = pedra;
            ctx.fillRect(obsX, obsY, obsT, obsT);
            ctx.fillStyle = 'rgba(255, 255, 255, .16)';
            ctx.fillRect(obsX, obsY, obsT, Math.max(1, cell * 0.14));
            ctx.strokeStyle = 'rgba(0, 0, 0, .55)';
            ctx.lineWidth = Math.max(1, cell * 0.05);
            ctx.strokeRect(obsX + 1, obsY + 1, obsT - 2, obsT - 2);
        });
    }

    foods.forEach(f => {
        desenharMaca(ctx, area.x + f.x * cell, area.y + f.y * cell, cell, performance.now());
    });

    if (rgbOn && rgb) {
        /* Maçã colorida (RGB): mesma maçã caprichada das outras,
           mas com arco-íris girando (matiz animada). */
        desenharMaca(
            ctx,
            area.x + rgb.x * cell,
            area.y + rgb.y * cell,
            cell,
            performance.now(),
            false,
            (performance.now() / 6) % 360
        );
    }

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
        /* No modo Gigante (escala 2x), o desenho da skin é
           ampliado para preencher o bloco 2x2 da hitbox —
           vale para qualquer skin. */
        const celulaDesenho = cell * escalaAtual();
        ctx.save();
        desenharSegmento(px, py, celulaDesenho, i, s.length);
        ctx.restore();
        if (i === 0) {
            ctx.fillStyle = '#111';
            const olho = Math.max(2, celulaDesenho * 0.13);
            ctx.fillRect(px + celulaDesenho * 0.25, py + celulaDesenho * 0.25, olho, olho);
            ctx.fillRect(px + celulaDesenho * 0.65, py + celulaDesenho * 0.25, olho, olho);
        }
    });
}

/* =========================================================
   HUD
========================================================= */
function hud() {
    $('score').textContent = score;
    if (mapMode === 'Tempo') {
        $('time').textContent = Math.max(0, Math.ceil(LIMITE_TEMPO_MODO - gameTime)) + 's';
    } else {
        $('time').textContent = Math.floor(gameTime) + 's';
    }
    $('lvl').textContent = 'Nível ' + level;
    if (mapMode === 'Caos' && gameTime < mensagemEventoAte) {
        $('toastEvento').textContent = mensagemEvento;
        $('toastEvento').classList.remove('hide');
    } else {
        $('toastEvento').classList.add('hide');
    }
    const label = document.querySelector('#wrap label');
    if (label) label.textContent = `MAPA ${mapSize}×${mapSize} · ${MAPMODE_LABEL[mapMode]}`;
}

/* =========================================================
   LOOP PRINCIPAL
========================================================= */
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
        }

        if (modoEncolheMapa()) {
            const reducoes = Math.floor(gameTime / 60);
            const tamanhoEsperado = Math.max(MAPA_MINIMO, MAPA_INICIAL - reducoes * 2);
            if (tamanhoEsperado < mapSize) shrinkMap();
        }

        hud();
        draw();
    }
    requestAnimationFrame(loop);
}

/* =========================================================
   NAVEGAÇÃO ENTRE TELAS
========================================================= */
const TELAS = ['home', 'ranking', 'game', 'menuSkins'];
function showScreen(id) {
    TELAS.forEach(s => $(s).classList.add('hide'));
    $(id).classList.remove('hide');
}
function atualizarStatusJogador() {
    if ($('homeCoins')) $('homeCoins').textContent = coins;
    if ($('homeLevel')) $('homeLevel').textContent = playerLevel();
}

/* =========================================================
   COMEÇAR / REINICIAR RODADA
========================================================= */
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

/* =========================================================
   CONTAGEM REGRESSIVA (3, 2, 1)
========================================================= */
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

/* =========================================================
   TELA DE FIM DE JOGO
========================================================= */
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
    ensureOverlayInfo().textContent = `${name}: ${score} pts · ${formatarTempo(gameTime)} · +${coinsThisRun} 🪙`;
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

/* =========================================================
   FIM DE JOGO
========================================================= */
function end() {
    if (!run) return;
    run = false;
    vibrar([120, 60, 140]);
    rank.push({ name, score, time: Math.floor(gameTime), modo: mapMode, diff });
    rank.sort((a, b) => (b.score !== a.score) ? b.score - a.score : b.time - a.time);
    rank = rank.slice(0, 50);
    localStorage.snakeRank = JSON.stringify(rank);
    coins += coinsThisRun;
    totalXP += score;
    localStorage.snakeCoins = coins;
    localStorage.snakeXP = totalXP;
    salvarRanking(name, score, Math.floor(gameTime), mapMode);
    salvarProgresso();
    showGameOverOverlay();
}

/* =========================================================
   HOME
========================================================= */
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

/* =========================================================
   RANKING (global via Supabase, com fallback local)
========================================================= */
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
    if (!rankingGlobal || !rankingGlobal.length) {
        renderRankingLocal();
        return;
    }
    $('scores').innerHTML = rankingGlobal.map((r, i) => {
        const safeName = String(r.nome).replace(/[<>&]/g, '');
        const dificuldade = String(r.dificuldade || 'Normal').replace(/[<>&]/g, '');
        const tempoFormatado = formatarTempo(r.tempo);
        return `<div class="row rankRow"><span>${i + 1}. ${safeName}</span><b>${r.pontuacao} pts · ${tempoFormatado} · ${dificuldade}</b></div>`;
    }).join('');
}
async function showRank() {
    showScreen('ranking');
    popularSeletorModoRanking();
    await carregarEExibirRanking();
}
$('rankModoSelect').onchange = () => {
    rankModoSelecionado = $('rankModoSelect').value;
    carregarEExibirRanking();
};

/* =========================================================
   PAUSA
========================================================= */
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
   BOTÕES
========================================================= */
$('play').onclick = begin;
$('rank').onclick = showRank;
$('back').onclick = home;
$('menu').onclick = () => { if (run) togglePause(); else home(); };
$('pause').onclick = togglePause;
$('cont').onclick = () => {
    if (!run) {
        $('overlay').classList.add('hide');
        resetOverlayParaPausa();
        startRound();
    } else {
        togglePause();
    }
};
$('reset').onclick = () => {
    reset();
    paused = false;
    $('overlay').classList.add('hide');
    lastMove = performance.now();
};
$('tomenu').onclick = home;
document.querySelectorAll('.voltarMenu').forEach(btn => { btn.onclick = home; });

/* Botões das notas de atualização e da prévia grande */
$('abrirNotas').onclick = () => {
    const notas = $('notasAtualizacao');
    notas.classList.remove('fechada');
    notas.classList.add('aberta');
};
$('fecharNotas').onclick = () => {
    const notas = $('notasAtualizacao');
    notas.classList.remove('aberta');
    notas.classList.add('fechada');
};
$('alternarPrevia').onclick = () => {
    const ligada = document.body.classList.toggle('previaLigada');
    $('alternarPrevia').textContent = ligada ? '🙈 Esconder prévia' : '👁 Mostrar prévia';
    if (!ligada) previaGrandeSkin = null;
};

/* =========================================================
   LOGIN — BOTÕES
========================================================= */
function ligarBotao(id, acao) {
    const el = document.getElementById(id);
    if (el) el.onclick = acao;
}
ligarBotao('openLogin', () => $('modalLogin').classList.remove('hide'));
ligarBotao('fecharLogin', () => {
    $('modalLogin').classList.add('hide');
    const msg = $('loginMensagem');
    if (msg) msg.classList.add('hide');
});
ligarBotao('btnGoogle', () => entrarComProvider('google'));
ligarBotao('btnFacebook', () => entrarComProvider('facebook'));
ligarBotao('btnEmail', entrarComEmail);
ligarBotao('btnLogout', sair);
ligarBotao('btnConfirmarNick', confirmarNick);
ligarBotao('pularNick', esconderEscolhaNick);
const inputNickEscolha = document.getElementById('nickEscolha');
if (inputNickEscolha) {
    inputNickEscolha.addEventListener('keydown', e => {
        if (e.key === 'Enter') confirmarNick();
    });
}

/* =========================================================
   NOME
========================================================= */
$('name').oninput = e => {
    localStorage.snakeName = e.target.value;
    nickAlterado();
    atualizarUIAuth();
};

/* =========================================================
   TEMA (inline na home — grade de swatches)
========================================================= */
function renderTemas() {
    const lista = Object.keys(T);
    $('listaTemas').innerHTML = lista.map(t => {
        const cores = T[t];
        const ativo = (t === theme);
        const corPrincipal = col(cores[1]), corSecundaria = col(cores[2]);
        return `
            <div class="temaSwatch ${ativo ? 'ativa' : ''}" data-tema="${t}" style="background: linear-gradient(135deg, ${corPrincipal}, ${corSecundaria});">
                <span>${t}</span>
            </div>`;
    }).join('');
    $('listaTemas').querySelectorAll('[data-tema]').forEach(el => {
        el.onclick = () => {
            theme = el.dataset.tema;
            localStorage.snakeTheme = theme;
            apply();
            renderTemas();
            salvarProgresso();
        };
    });
}

/* =========================================================
   DIFICULDADE (inline na home)
========================================================= */
function renderDificuldades() {
    const lista = Object.keys(D);
    $('listaDificuldades').innerHTML = lista.map(d => {
        const ativo = (d === diff) ? 'ativo' : '';
        return `<button class="opcaoLista ${ativo}" data-diff="${d}">${d}</button>`;
    }).join('');
    $('listaDificuldades').querySelectorAll('[data-diff]').forEach(btn => {
        btn.onclick = () => {
            diff = btn.dataset.diff;
            localStorage.snakeDiff = diff;
            apply();
            renderDificuldades();
            salvarProgresso();
        };
    });
}

/* =========================================================
   MODO DE MAPA (inline na home)
========================================================= */
function renderModos() {
    $('listaModos').innerHTML = MAPMODES.map(m => {
        const ativo = (m === mapMode) ? 'ativo' : '';
        return `<button class="opcaoLista ${ativo}" data-modo="${m}">${MAPMODE_LABEL[m]}</button>`;
    }).join('');
    $('listaModos').querySelectorAll('[data-modo]').forEach(btn => {
        btn.onclick = () => {
            mapMode = btn.dataset.modo;
            localStorage.snakeMapMode = mapMode;
            apply();
            renderModos();
            salvarProgresso();
        };
    });
}

/* =========================================================
   MENU: SKINS
========================================================= */
/* Prévia animada: cada skin ganha uma mini cobrinha viva
   desenhada com a MESMA função do jogo, então o jogador vê
   exatamente como a skin fica antes de selecionar. */
let previaAnimRaf = null;
let previaGrandeSkin = null;
/* Simulação da prévia grande: uma cobrinha IA caça a maçã
   num mini tabuleiro, desenhada com a skin escolhida. */
let simPrev = null;
function simPrevReset() {
    const cols = 10, rows = 15;
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    simPrev = {
        cols: cols, rows: rows,
        snake: [[cx, cy], [cx - 1, cy], [cx - 2, cy]],
        dir: [1, 0],
        maca: [Math.min(cols - 1, cx + 3), Math.max(0, cy - 4)],
        ultimo: 0
    };
}
function simPrevPasso() {
    const s = simPrev;
    const hx = s.snake[0][0], hy = s.snake[0][1];
    const dx = s.maca[0] - hx, dy = s.maca[1] - hy;
    const prefs = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx) prefs.push([Math.sign(dx), 0]);
        if (dy) prefs.push([0, Math.sign(dy)]);
    } else {
        if (dy) prefs.push([0, Math.sign(dy)]);
        if (dx) prefs.push([Math.sign(dx), 0]);
    }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => {
        if (!prefs.some(p => p[0] === d[0] && p[1] === d[1])) prefs.push(d);
    });
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
    if (!achou || nx < 0 || ny < 0 || nx >= s.cols || ny >= s.rows ||
        s.snake.some(c => c[0] === nx && c[1] === ny)) {
        simPrevReset();
        return;
    }
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
/* Miniatura ESTÁTICA (usada no celular): desenha a cobrinha
   uma única vez, sem animação — economiza bateria e mata o
   lag da lista de skins em aparelhos mais fracos. */
function desenharMiniEstatica(cnv) {
    const g = cnv.getContext('2d');
    const w = cnv.width, h = cnv.height;
    g.shadowBlur = 0;
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
function animarPreviasSkins() {
    const aberta = !$('menuSkins').classList.contains('hide');
    document.body.classList.toggle('mostrandoSkins', aberta && (window.innerWidth >= 900 || document.body.classList.contains('previaLigada')));
    if (!aberta) { previaAnimRaf = null; return; }
    const agora = Date.now();
    /* No celular as miniaturas ficam estáticas (desenhadas uma
       vez no renderSkins); só o PC anima todas em tempo real. */
    if (!ehMobile) document.querySelectorAll('#listaSkins .previaCanvas').forEach(cnv => {
        const g = cnv.getContext('2d');
        const w = cnv.width, h = cnv.height;
        g.shadowBlur = 0;
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
    /* Prévia GRANDE = SIMULAÇÃO: mini tabuleiro com cobrinha
       IA caçando a maçã, usando a skin selecionada ou a que
       o mouse passar por cima. */
    const pgCnv = $('previaGrandeCanvas');
    if (pgCnv) {
        if (!simPrev) simPrevReset();
        let passos = 0;
        while (agora - simPrev.ultimo >= 140 && passos < 5) {
            simPrev.ultimo += 140;
            simPrevPasso();
            passos++;
        }
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
        for (let i = nG - 1; i >= 0; i--) {
            const c = simPrev.snake[i];
            desenharSegmento(c[0] * cellP, c[1] * cellP, cellP, i, nG, gP);
        }
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
        if (ativa) {
            acaoHtml = `<span class="tagSelecionada">SELECIONADA</span>`;
        } else if (desbloqueada) {
            acaoHtml = `<button class="botaoSelecionar" data-selecionar="${nomeSkin}">Selecionar</button>`;
        } else {
            const podeComprar = coins >= info.custo;
            acaoHtml = `
                <span class="infoBloqueio">Nível ${info.nivel} ou</span>
                <button class="botaoComprar" data-comprar="${nomeSkin}" ${podeComprar ? '' : 'disabled'}>🪙 ${info.custo}</button>`;
        }
        return `
            <div class="linhaSkin ${ativa ? 'ativa' : ''}">
                <div class="previaSkin previa-${nomeSkin}"><canvas class="previaCanvas" data-skin="${nomeSkin}" width="84" height="84"></canvas>${ehMobile ? `<button class="btnOlhoPrev" data-olho="${nomeSkin}" aria-label="Ver prévia de ${info.nome}">👁</button>` : ''}</div>
                <div class="infoSkin"><b>${info.nome}</b></div>
                <div class="acaoSkin">${acaoHtml}</div>
            </div>`;
    }).join('');
    if (ehMobile) {
        /* Celular: miniaturas paradas (desenha 1x) + olho que
           abre a prévia grande apenas da skin clicada. */
        $('listaSkins').querySelectorAll('.previaCanvas').forEach(desenharMiniEstatica);
    }
    if (!previaAnimRaf) previaAnimRaf = requestAnimationFrame(animarPreviasSkins);
    previaGrandeSkin = null;
    $('listaSkins').querySelectorAll('.linhaSkin').forEach(linha => {
        linha.addEventListener('mouseenter', () => {
            const cnvL = linha.querySelector('.previaCanvas');
            if (cnvL) previaGrandeSkin = cnvL.dataset.skin;
        });
    });
    $('listaSkins').querySelectorAll('[data-olho]').forEach(btn => {
        btn.onclick = () => {
            const nSk = btn.dataset.olho;
            if (document.body.classList.contains('previaLigada') && previaGrandeSkin === nSk) {
                document.body.classList.remove('previaLigada');
                previaGrandeSkin = null;
            } else {
                previaGrandeSkin = nSk;
                document.body.classList.add('previaLigada');
            }
            $('listaSkins').querySelectorAll('.btnOlhoPrev').forEach(b =>
                b.classList.toggle('olhoAtivo', b.dataset.olho === previaGrandeSkin));
        };
    });
    $('listaSkins').querySelectorAll('[data-selecionar]').forEach(btn => {
        btn.onclick = () => {
            skin = btn.dataset.selecionar;
            localStorage.snakeSkin = skin;
            apply();
            renderSkins();
            salvarProgresso();
        };
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

/* =========================================================
   INICIALIZAÇÃO
========================================================= */
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
