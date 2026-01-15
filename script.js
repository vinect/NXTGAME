// --- CONFIG ---
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

// FARBEN
const COLOR_DEFS = {
    magenta: { name: 'Magenta', hex: '#F20089', hsvLow: [145, 100, 80, 0], hsvHigh: [175, 255, 255, 255] },
    yellow: { name: 'Gelb', hex: '#FFD600', hsvLow: [20, 100, 100, 0], hsvHigh: [35, 255, 255, 255] },
    blue: { name: 'Blau', hex: '#2962FF', hsvLow: [90, 100, 50, 0], hsvHigh: [130, 255, 255, 255] },
    green: { name: 'Grün', hex: '#00C853', hsvLow: [35, 50, 50, 0], hsvHigh: [85, 255, 255, 255] }
};

// Start State
let players = [
    { name: 'Spieler 1', colorKey: 'magenta', score: 0 },
    { name: 'Spieler 2', colorKey: 'yellow', score: 0 }
];

let cvReady = false;
let streamObject = null;
let activeViewId = 'view-setup';
let isScanning = false;
let scanInterval = null;
let stabilityCounter = 0;
const REQUIRED_STABILITY = 6; 

// ELEMENTS
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const playersContainer = document.getElementById('players-container');
const addPlayerBtn = document.getElementById('add-player-btn');
const removePlayerBtn = document.getElementById('remove-player-btn');
const playerCountDisplay = document.getElementById('player-count-display');
const startBtn = document.getElementById('start-game-btn');
const instructionText = document.getElementById('instruction-text');
const scanLine = document.getElementById('scan-line');
const lockOverlay = document.getElementById('lock-overlay');
const controlsSheet = document.getElementById('controls-sheet');
const scoreList = document.getElementById('score-list');
const winnerMsg = document.getElementById('winner-msg');
const nextGameBtn = document.getElementById('next-game-btn');
const retryBtn = document.getElementById('retry-btn');
const historyList = document.getElementById('history-list');
const deleteBtn = document.getElementById('delete-btn');
const fabHome = document.getElementById('fab-home');
const randomStartBtn = document.getElementById('random-start-btn');
const randomResultDisplay = document.getElementById('random-result');

function onOpenCvReady() { console.log("NXT Engine Ready"); cvReady = true; }

// --- PLAYER MANAGEMENT ---
function renderPlayers() {
    playersContainer.innerHTML = '';
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

        card.innerHTML = `
            <div class="player-name-row">
                <span class="player-label">Name</span>
                <input type="text" class="player-input" value="${p.name}" data-idx="${idx}" onchange="updatePlayerName(this)" placeholder="Name">
            </div>
            <div class="color-picker">${dotsHtml}</div>
        `;
        playersContainer.appendChild(card);
    });
    playerCountDisplay.innerText = `${players.length}`;
    addPlayerBtn.disabled = players.length >= MAX_PLAYERS;
    removePlayerBtn.disabled = players.length <= MIN_PLAYERS;
}

window.updatePlayerName = (input) => { players[input.dataset.idx].name = input.value; };
window.setPlayerColor = (playerIdx, newColorKey) => {
    const otherPlayerIdx = players.findIndex(p => p.colorKey === newColorKey);
    const oldColorKey = players[playerIdx].colorKey;
    if (otherPlayerIdx !== -1 && otherPlayerIdx !== playerIdx) players[otherPlayerIdx].colorKey = oldColorKey;
    players[playerIdx].colorKey = newColorKey;
    renderPlayers();
};

addPlayerBtn.addEventListener('click', () => {
    if (players.length < MAX_PLAYERS) {
        const taken = players.map(p => p.colorKey);
        const freeKey = Object.keys(COLOR_DEFS).find(k => !taken.includes(k)) || 'magenta';
        players.push({ name: `Spieler ${players.length+1}`, colorKey: freeKey, score: 0 });
        renderPlayers();
    }
});
removePlayerBtn.addEventListener('click', () => { if (players.length > MIN_PLAYERS) { players.pop(); renderPlayers(); } });

// --- RANDOM STARTER ---
randomStartBtn.addEventListener('click', () => {
    if (randomStartBtn.disabled) return;
    randomStartBtn.disabled = true;
    randomResultDisplay.classList.remove('hidden');
    randomResultDisplay.classList.add('animating');
    let counter = 0; const cycles = 15;
    const interval = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * players.length);
        randomResultDisplay.innerText = players[randomIdx].name;
        counter++; if(navigator.vibrate) navigator.vibrate(20);
        if (counter >= cycles) {
            clearInterval(interval);
            const finalIdx = Math.floor(Math.random() * players.length);
            randomResultDisplay.innerText = `${players[finalIdx].name} fängt an!`;
            randomResultDisplay.classList.remove('animating');
            if(navigator.vibrate) navigator.vibrate([50, 50, 100]);
            randomStartBtn.disabled = false;
        }
    }, 80);
});

// --- NAVIGATION ---
const views = document.querySelectorAll('.view');
const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('side-menu-overlay');

function toggleMenu() { sideMenu.classList.toggle('open'); menuOverlay.classList.toggle('open'); }
menuBtn.onclick = toggleMenu; menuOverlay.onclick = toggleMenu;

function switchView(id) {
    sideMenu.classList.remove('open'); menuOverlay.classList.remove('open');
    views.forEach(v => v.classList.remove('active-view'));
    document.getElementById(id).classList.add('active-view');
    activeViewId = id;
    fabHome.classList.toggle('hidden', id === 'view-setup');
    if (id === 'view-game') startCamera(); else { stopCamera(); stopAutoScan(); }
    if (id === 'view-history') renderHistory();
}

document.querySelectorAll('.menu-item').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); switchView(btn.getAttribute('data-target'));
    };
});
fabHome.onclick = () => switchView('view-setup');

document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { stopCamera(); stopAutoScan(); } 
    else { if (activeViewId === 'view-game') setTimeout(startCamera, 300); }
});

// --- GAME ---
startBtn.addEventListener('click', () => { resetGameUI(); switchView('view-game'); });
nextGameBtn.addEventListener('click', () => switchView('view-setup'));

function resetGameUI() {
    controlsSheet.classList.add('hidden');
    canvas.style.display = 'none'; video.style.display = 'block';
    instructionText.innerText = "Suche 37 Pins...";
    instructionText.classList.remove('scanning', 'success'); instructionText.style.background = "rgba(0,0,0,0.6)";
    scanLine.classList.add('hidden'); lockOverlay.classList.add('hidden'); lockOverlay.classList.remove('flash');
    stabilityCounter = 0;
    randomResultDisplay.classList.add('hidden');
}

async function startCamera() {
    if (streamObject) return;
    try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch(e){}
    try {
        streamObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } } });
        video.srcObject = streamObject;
        video.onloadedmetadata = () => { video.play(); canvas.width = video.videoWidth; canvas.height = video.videoHeight; startAutoScan(); };
    } catch (e) { console.error(e); }
}
function stopCamera() { if (streamObject) { streamObject.getTracks().forEach(t => t.stop()); streamObject = null; } }

function startAutoScan() {
    if (isScanning || !cvReady) return;
    isScanning = true; scanLine.classList.remove('hidden');
    scanInterval = setInterval(runPinCheck, 150);
}
function stopAutoScan() { isScanning = false; clearInterval(scanInterval); scanLine.classList.add('hidden'); instructionText.classList.remove('scanning'); }

// --- PIN CHECK (SQUARE LOGIC) ---
function runPinCheck() {
    if (!video.videoWidth) return;
    const w = 320; const h = 240;
    const smallCanvas = document.createElement('canvas'); smallCanvas.width = w; smallCanvas.height = h;
    smallCanvas.getContext('2d').drawImage(video, 0, 0, w, h);
    
    let src = cv.imread(smallCanvas);
    let gray = new cv.Mat();
    let binary = new cv.Mat();
    let contours = new cv.MatVector();
    
    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
        cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
        
        cv.findContours(binary, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let pinCount = 0;
        for(let i=0; i<contours.size(); i++) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            if (area > 5 && area < 200) { 
                let rect = cv.boundingRect(cnt);
                let aspectRatio = rect.width / rect.height;
                if (aspectRatio > 0.7 && aspectRatio < 1.3) {
                    let hull = new cv.Mat();
                    cv.convexHull(cnt, hull);
                    let hullArea = cv.contourArea(hull);
                    let solidity = area / hullArea;
                    hull.delete();
                    if (solidity > 0.8) pinCount++;
                }
            }
        }

        if (pinCount >= 25 && pinCount <= 50) {
            stabilityCounter++;
            let p = Math.min(100, Math.round((stabilityCounter/REQUIRED_STABILITY)*100));
            instructionText.innerText = `Brett erkannt... ${p}%`;
            instructionText.classList.add('success');
            
            if (stabilityCounter >= REQUIRED_STABILITY) {
                lockOverlay.classList.remove('hidden');
                lockOverlay.classList.add('flash');
                setTimeout(triggerFullAnalysis, 600);
            }
        } else {
            stabilityCounter = Math.max(0, stabilityCounter - 1);
            if (stabilityCounter === 0) { 
                instructionText.innerText = `Suche 37 Pins...`; 
                instructionText.classList.remove('success'); 
                lockOverlay.classList.add('hidden');
                lockOverlay.classList.remove('flash');
            }
        }
        src.delete(); gray.delete(); binary.delete(); contours.delete();
    } catch(e) { stopAutoScan(); console.error(e); }
}

function triggerFullAnalysis() {
    stopAutoScan(); instructionText.innerText = "Auswertung...";
    if(navigator.vibrate) navigator.vibrate([50, 100]);
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.style.display = 'none'; canvas.style.display = 'block';
    analyzeImageFull();
}

function analyzeImageFull() {
    let src = cv.imread(canvas); let hsv = new cv.Mat(); let contours = new cv.MatVector();
    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        let rect = new cv.Rect(Math.floor(canvas.width*0.1), Math.floor(canvas.height*0.1), Math.floor(canvas.width*0.8), Math.floor(canvas.height*0.8));
        let roi = hsv.roi(rect);
        
        players.forEach(p => {
            let mask = new cv.Mat(); let c = COLOR_DEFS[p.colorKey];
            let low = new cv.Mat(roi.rows, roi.cols, roi.type(), c.hsvLow); let high = new cv.Mat(roi.rows, roi.cols, roi.type(), c.hsvHigh);
            cv.inRange(roi, low, high, mask);
            let kernel = cv.Mat.ones(3, 3, cv.CV_8U); 
            cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
            cv.findContours(mask, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            p.score = 0; for(let i=0; i<contours.size(); i++) { if(cv.contourArea(contours.get(i)) > 300) p.score++; }
            mask.delete(); low.delete(); high.delete();
        });
        finishGameAndSave();
        src.delete(); hsv.delete(); roi.delete(); contours.delete();
    } catch(e) { console.error(e); }
}

function finishGameAndSave() {
    controlsSheet.classList.remove('hidden');
    scoreList.innerHTML = '';
    const rankedPlayers = [...players].sort((a,b) => b.score - a.score);
    const winner = rankedPlayers[0];
    
    let history = JSON.parse(localStorage.getItem('nxt_games_v14')) || [];
    history.push({ date: new Date().toISOString(), winner: winner.name, topScore: winner.score, players: players.map(p=>({n:p.name, s:p.score})) });
    localStorage.setItem('nxt_games_v14', JSON.stringify(history));

    rankedPlayers.forEach((p, idx) => {
        const rank = idx + 1;
        let rankClass = rank === 1 ? 'rank-1 winner-glow' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : ''));
        const div = document.createElement('div'); div.className = `rank-card ${rankClass}`;
        const colorHex = COLOR_DEFS[p.colorKey].hex;
        div.innerHTML = `<div class="rank-info"><div class="rank-pos">${rank}</div><div class="rank-dot" style="background:${colorHex}"></div><span class="rank-name">${p.name}</span></div><span class="rank-score">${p.score}</span>`;
        scoreList.appendChild(div);
    });

    if (winner.score > 0) {
        winnerMsg.innerText = "Ergebnis";
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, zIndex: 1000 });
    } else { winnerMsg.innerText = "Keine Figuren?"; }
}

retryBtn.onclick = () => { resetGameUI(); startAutoScan(); if(video.paused) video.play(); };

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_games_v14')) || [];
    historyList.innerHTML = '';
    if(history.length === 0) { historyList.innerHTML = '<div class="empty-state">Keine Einträge</div>'; return; }
    history.slice().reverse().forEach(g => {
        let time = new Date(g.date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        const details = g.players.map(p => `${p.n}: ${p.s}`).join(', ');
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `<div style="flex:1;"><div class="hist-winner">🏆 ${g.winner} (${g.topScore})</div><div style="font-size:0.75rem;color:#666;margin-top:2px;">${details}</div></div><div style="font-size:0.7rem;color:#999;text-align:right;">${time}</div>`;
        historyList.appendChild(div);
    });
}
deleteBtn.onclick = () => { if(confirm('Löschen?')) { localStorage.removeItem('nxt_games_v14'); renderHistory(); } };

renderPlayers();
checkIOS();
function checkIOS() { const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; const isStandalone = window.matchMedia('(display-mode: standalone)').matches; if (isIOS && !isStandalone) { const p = document.getElementById('ios-install-prompt'); setTimeout(() => p.classList.remove('hidden'), 2000); document.getElementById('close-prompt').onclick = () => p.classList.add('hidden'); } }