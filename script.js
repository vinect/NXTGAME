document.addEventListener("DOMContentLoaded", () => { initGame(); });

const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

// FARBEN UND HSV BEREICHE
const COLOR_DEFS = {
    magenta: { name: 'Magenta', hex: '#E91E63', hsvLow: [140, 60, 60, 0], hsvHigh: [175, 255, 255, 255] },
    yellow: { name: 'Gelb', hex: '#FFD600', hsvLow: [15, 80, 80, 0], hsvHigh: [35, 255, 255, 255] },
    blue: { name: 'Blau', hex: '#2962FF', hsvLow: [95, 80, 60, 0], hsvHigh: [135, 255, 255, 255] },
    green: { name: 'Grün', hex: '#00C853', hsvLow: [35, 60, 60, 0], hsvHigh: [85, 255, 255, 255] }
};

let players = [ { name: 'Spieler 1', colorKey: 'magenta', score: 0 }, { name: 'Spieler 2', colorKey: 'yellow', score: 0 } ];
let cvReady = false;
let streamObject = null;
let isScanning = false;
let scanInterval = null;
let stabilityCounter = 0;
const REQUIRED_STABILITY = 6; 

// DOM
const elements = {
    video: document.getElementById('video'),
    canvas: document.getElementById('canvas'),
    playersContainer: document.getElementById('players-container'),
    playerCountDisplay: document.getElementById('player-count-display'),
    addPlayerBtn: document.getElementById('add-player-btn'),
    removePlayerBtn: document.getElementById('remove-player-btn'),
    startBtn: document.getElementById('start-game-btn'),
    instructionText: document.getElementById('instruction-text'),
    scanLine: document.getElementById('scan-line'),
    lockOverlay: document.getElementById('lock-overlay'),
    controlsSheet: document.getElementById('controls-sheet'),
    scoreList: document.getElementById('score-list'),
    winnerMsg: document.getElementById('winner-msg'),
    nextGameBtn: document.getElementById('next-game-btn'),
    retryBtn: document.getElementById('retry-btn'),
    fabHome: document.getElementById('fab-home'),
    randomStartBtn: document.getElementById('random-start-btn'),
    randomResultDisplay: document.getElementById('random-result'),
    installModal: document.getElementById('install-modal'),
    installInstructions: document.getElementById('install-instructions'),
    installDismissBtn: document.getElementById('install-dismiss-btn'),
    closeInstallBtn: document.getElementById('close-install')
};

function initGame() {
    renderPlayers();
    checkInstallState();
    
    if(elements.addPlayerBtn) elements.addPlayerBtn.onclick = addPlayer;
    if(elements.removePlayerBtn) elements.removePlayerBtn.onclick = removePlayer;
    if(elements.startBtn) elements.startBtn.onclick = () => { resetGameUI(); switchView('view-game'); };
    if(elements.nextGameBtn) elements.nextGameBtn.onclick = () => switchView('view-setup');
    if(elements.retryBtn) elements.retryBtn.onclick = () => { resetGameUI(); startAutoScan(); if(elements.video.paused) elements.video.play(); };
    if(elements.fabHome) elements.fabHome.onclick = () => switchView('view-setup');
    if(elements.randomStartBtn) elements.randomStartBtn.onclick = runRandomStarter;
    if(elements.installDismissBtn) elements.installDismissBtn.onclick = () => elements.installModal.classList.add('hidden');
    if(elements.closeInstallBtn) elements.closeInstallBtn.onclick = () => elements.installModal.classList.add('hidden');
}

function onOpenCvReady() { console.log("CV Ready"); cvReady = true; }

function renderPlayers() {
    if(!elements.playersContainer) return;
    elements.playersContainer.innerHTML = '';
    players.forEach((p, idx) => {
        const card = document.createElement('div');
        const colorData = COLOR_DEFS[p.colorKey];
        card.className = 'player-card';
        card.style.borderLeftColor = colorData.hex;
        let dotsHtml = '';
        Object.keys(COLOR_DEFS).forEach(key => {
            const def = COLOR_DEFS[key];
            const isActive = (p.colorKey === key) ? 'active' : '';
            dotsHtml += `<div class="color-option ${isActive}" style="background:${def.hex};" onclick="setPlayerColor(${idx}, '${key}')"></div>`;
        });
        card.innerHTML = `<div class="player-name-row"><span class="player-label">Name</span><input type="text" class="player-input" value="${p.name}" data-idx="${idx}" onchange="updatePlayerName(this)" placeholder="Name"></div><div class="color-picker">${dotsHtml}</div>`;
        elements.playersContainer.appendChild(card);
    });
    if(elements.playerCountDisplay) elements.playerCountDisplay.innerText = `${players.length}`;
    if(elements.addPlayerBtn) elements.addPlayerBtn.disabled = players.length >= MAX_PLAYERS;
    if(elements.removePlayerBtn) elements.removePlayerBtn.disabled = players.length <= MIN_PLAYERS;
}

window.updatePlayerName = (input) => { players[input.dataset.idx].name = input.value; };
window.setPlayerColor = (playerIdx, newColorKey) => {
    const otherPlayerIdx = players.findIndex(p => p.colorKey === newColorKey);
    const oldColorKey = players[playerIdx].colorKey;
    if (otherPlayerIdx !== -1 && otherPlayerIdx !== playerIdx) players[otherPlayerIdx].colorKey = oldColorKey;
    players[playerIdx].colorKey = newColorKey;
    renderPlayers();
};

function addPlayer() { if (players.length < MAX_PLAYERS) { const taken = players.map(p => p.colorKey); const freeKey = Object.keys(COLOR_DEFS).find(k => !taken.includes(k)) || 'magenta'; players.push({ name: `Spieler ${players.length+1}`, colorKey: freeKey, score: 0 }); renderPlayers(); } }
function removePlayer() { if (players.length > MIN_PLAYERS) { players.pop(); renderPlayers(); } }

function runRandomStarter() {
    const btn = elements.randomStartBtn;
    if (btn.disabled) return;
    btn.disabled = true;
    elements.randomResultDisplay.classList.remove('hidden');
    elements.randomResultDisplay.classList.add('animating');
    let counter = 0;
    const interval = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * players.length);
        elements.randomResultDisplay.innerText = players[randomIdx].name;
        counter++;
        if (counter >= 15) {
            clearInterval(interval);
            const finalIdx = Math.floor(Math.random() * players.length);
            elements.randomResultDisplay.innerText = `${players[finalIdx].name} fängt an!`;
            elements.randomResultDisplay.classList.remove('animating');
            if(navigator.vibrate) navigator.vibrate([50, 100]);
            btn.disabled = false;
        }
    }, 80);
}

// --- VIEW NAVIGATION ---
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('side-menu-overlay');
const menuBtn = document.getElementById('menu-btn');

if(menuBtn) {
    menuBtn.onclick = () => { sideMenu.classList.toggle('open'); menuOverlay.classList.toggle('open'); };
    menuOverlay.onclick = () => { sideMenu.classList.remove('open'); menuOverlay.classList.remove('open'); };
}

function switchView(id) {
    sideMenu.classList.remove('open'); menuOverlay.classList.remove('open');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById(id).classList.add('active-view');
    elements.fabHome.classList.toggle('hidden', id === 'view-setup');
    if (id === 'view-game') startCamera(); else { stopCamera(); stopAutoScan(); }
    if (id === 'view-history') renderHistory();
}

// --- SCANNING ---
function resetGameUI() {
    elements.controlsSheet.classList.add('hidden');
    elements.canvas.style.display = 'none'; elements.video.style.display = 'block';
    elements.instructionText.innerText = "Suche Spielfeld...";
    elements.instructionText.classList.remove('success'); elements.lockOverlay.classList.add('hidden'); elements.lockOverlay.classList.remove('flash');
    stabilityCounter = 0;
}

async function startCamera() {
    if (streamObject) return;
    try {
        streamObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        elements.video.srcObject = streamObject;
        elements.video.onloadedmetadata = () => { elements.video.play(); elements.canvas.width = elements.video.videoWidth; elements.canvas.height = elements.video.videoHeight; startAutoScan(); };
    } catch (e) { console.error(e); alert("Kamera-Fehler"); }
}
function stopCamera() { if (streamObject) { streamObject.getTracks().forEach(t => t.stop()); streamObject = null; } }

function startAutoScan() {
    if (isScanning || !cvReady) return;
    isScanning = true; elements.scanLine.classList.remove('hidden');
    scanInterval = setInterval(runBoardCheck, 150);
}
function stopAutoScan() { isScanning = false; clearInterval(scanInterval); elements.scanLine.classList.add('hidden'); }

let foundBoardRect = null;

function runBoardCheck() {
    if (!elements.video.videoWidth) return;
    const w = 320; const h = 240;
    const smallCanvas = document.createElement('canvas'); smallCanvas.width = w; smallCanvas.height = h;
    smallCanvas.getContext('2d').drawImage(elements.video, 0, 0, w, h);
    
    let src = cv.imread(smallCanvas);
    let gray = new cv.Mat(); let blur = new cv.Mat(); let binary = new cv.Mat(); let contours = new cv.MatVector();
    
    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
        cv.threshold(blur, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        cv.findContours(binary, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let maxArea = 0; let bestContour = null;
        for(let i=0; i<contours.size(); i++) {
            let cnt = contours.get(i); let area = cv.contourArea(cnt);
            if (area > maxArea) { maxArea = area; bestContour = cnt; }
        }

        if (maxArea > (w * h * 0.15)) {
            stabilityCounter++;
            let p = Math.min(100, Math.round((stabilityCounter/REQUIRED_STABILITY)*100));
            elements.instructionText.innerText = `Brett erkannt... ${p}%`;
            elements.instructionText.classList.add('success');
            
            let rect = cv.boundingRect(bestContour);
            let scaleX = elements.video.videoWidth / w; let scaleY = elements.video.videoHeight / h;
            foundBoardRect = new cv.Rect(Math.max(0, rect.x * scaleX), Math.max(0, rect.y * scaleY), Math.min(elements.video.videoWidth, rect.width * scaleX), Math.min(elements.video.videoHeight, rect.height * scaleY));

            if (stabilityCounter >= REQUIRED_STABILITY) {
                elements.lockOverlay.classList.remove('hidden'); elements.lockOverlay.classList.add('flash');
                setTimeout(triggerFullAnalysis, 600);
            }
        } else {
            stabilityCounter = Math.max(0, stabilityCounter - 1);
            if (stabilityCounter === 0) { 
                elements.instructionText.innerText = "Suche Spielfeld...";
                elements.instructionText.classList.remove('success'); elements.lockOverlay.classList.add('hidden');
            }
        }
        src.delete(); gray.delete(); blur.delete(); binary.delete(); contours.delete();
    } catch(e) { stopAutoScan(); }
}

function triggerFullAnalysis() {
    stopAutoScan(); elements.instructionText.innerText = "Analysiere...";
    if(navigator.vibrate) navigator.vibrate([50, 100]);
    const ctx = elements.canvas.getContext('2d'); ctx.drawImage(elements.video, 0, 0, elements.canvas.width, elements.canvas.height);
    elements.video.style.display = 'none'; elements.canvas.style.display = 'block';
    analyzeImageFull();
}

function analyzeImageFull() {
    let src = cv.imread(elements.canvas);
    let roi = foundBoardRect ? src.roi(foundBoardRect) : src;
    let hsv = new cv.Mat(); let contours = new cv.MatVector();
    
    try {
        cv.cvtColor(roi, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        players.forEach(p => {
            let mask = new cv.Mat(); let c = COLOR_DEFS[p.colorKey];
            let low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), c.hsvLow); let high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), c.hsvHigh);
            cv.inRange(hsv, low, high, mask);
            
            let kernel = cv.Mat.ones(5, 5, cv.CV_8U); 
            cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
            cv.dilate(mask, mask, kernel);
            
            cv.findContours(mask, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            p.score = 0; 
            for(let i=0; i<contours.size(); i++) { 
                if(cv.contourArea(contours.get(i)) > 250) p.score++; 
            }
            mask.delete(); low.delete(); high.delete(); kernel.delete();
        });
        finishGameAndSave();
        src.delete(); hsv.delete(); if(foundBoardRect) roi.delete(); contours.delete();
    } catch(e) { console.error(e); }
}

function finishGameAndSave() {
    elements.controlsSheet.classList.remove('hidden');
    elements.scoreList.innerHTML = '';
    const rankedPlayers = [...players].sort((a,b) => b.score - a.score);
    const winner = rankedPlayers[0];
    
    let history = JSON.parse(localStorage.getItem('nxt_games_v17')) || [];
    history.push({ date: new Date().toISOString(), winner: winner.name, topScore: winner.score, players: players.map(p=>({n:p.name, s:p.score})) });
    localStorage.setItem('nxt_games_v17', JSON.stringify(history));

    rankedPlayers.forEach((p, idx) => {
        const rank = idx + 1;
        let rankClass = rank === 1 ? 'rank-1 winner-glow' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
        const div = document.createElement('div'); div.className = `rank-card ${rankClass}`;
        const colorHex = COLOR_DEFS[p.colorKey].hex;
        div.innerHTML = `<div class="rank-info"><div class="rank-pos">${rank}</div><div class="rank-dot" style="background:${colorHex}"></div><span class="rank-name">${p.name}</span></div><span class="rank-score">${p.score}</span>`;
        elements.scoreList.appendChild(div);
    });

    if (winner.score > 0) {
        elements.winnerMsg.innerText = "Ergebnis";
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, zIndex: 1000 });
    } else { elements.winnerMsg.innerText = "Keine Figuren?"; }
}

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_games_v17')) || [];
    const list = document.getElementById('history-list'); if(!list) return;
    list.innerHTML = '';
    if(history.length === 0) { list.innerHTML = '<div class="empty-state">Keine Einträge</div>'; return; }
    history.slice().reverse().forEach(g => {
        let time = new Date(g.date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        const details = g.players.map(p => `${p.n}: ${p.s}`).join(', ');
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `<div style="flex:1;"><div class="hist-winner">🏆 ${g.winner} (${g.topScore})</div><div style="font-size:0.75rem;color:#666;">${details}</div></div><div style="font-size:0.7rem;color:#999;">${time}</div>`;
        list.appendChild(div);
    });
}

function checkInstallState() {
    if (!elements.installModal) return;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (isStandalone) return; 
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isIOS) {
        elements.installInstructions.innerHTML = `1. Tippe unten auf <span class="step-icon icon-ios-share"></span><br>2. Wähle <strong>"Zum Home-Bildschirm"</strong>`;
        setTimeout(() => elements.installModal.classList.remove('hidden'), 2000);
    } else if (isAndroid) {
        elements.installInstructions.innerHTML = `1. Tippe oben auf <span class="step-icon icon-android-menu"></span><br>2. Wähle <strong>"App installieren"</strong>`;
        setTimeout(() => elements.installModal.classList.remove('hidden'), 2000);
    }
}

if(document.getElementById('delete-btn')) { document.getElementById('delete-btn').onclick = () => { if(confirm('Verlauf löschen?')) { localStorage.removeItem('nxt_games_v17'); renderHistory(); } }; }