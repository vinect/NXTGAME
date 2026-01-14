// --- CONFIG ---
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

const COLOR_DEFS = {
    teal: { name: 'Türkis', hex: '#009B9E', hsvLow: [80, 50, 50, 0], hsvHigh: [100, 255, 255, 255] },
    orange: { name: 'Orange', hex: '#FF9500', hsvLow: [5, 100, 100, 0], hsvHigh: [25, 255, 255, 255] },
    black: { name: 'Schwarz', hex: '#222222', hsvLow: [0, 0, 0, 0], hsvHigh: [180, 255, 60, 255] },
    white: { name: 'Weiß', hex: '#e0e0e0', hsvLow: [0, 0, 200, 0], hsvHigh: [180, 30, 255, 255] }
};

// Start State
let players = [
    { name: 'Spieler 1', colorKey: 'teal', score: 0 },
    { name: 'Spieler 2', colorKey: 'orange', score: 0 }
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
const controlsSheet = document.getElementById('controls-sheet');
const scoreList = document.getElementById('score-list');
const winnerMsg = document.getElementById('winner-msg');
const nextGameBtn = document.getElementById('next-game-btn');
const retryBtn = document.getElementById('retry-btn');
const historyList = document.getElementById('history-list');
const deleteBtn = document.getElementById('delete-btn');
const fabHome = document.getElementById('fab-home');

function onOpenCvReady() { console.log("NXT Engine Ready"); cvReady = true; }

// --- PLAYER UI & SWAP LOGIC ---
function renderPlayers() {
    playersContainer.innerHTML = '';
    
    players.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        
        let colorPickerHtml = '';
        Object.keys(COLOR_DEFS).forEach(key => {
            const def = COLOR_DEFS[key];
            const isActive = (p.colorKey === key) ? 'active' : '';
            // Farbe ist Weiß (braucht Border) oder normal
            const borderStyle = key === 'white' ? 'border:1px solid #ccc;' : '';
            
            colorPickerHtml += `
                <div class="color-option ${isActive}" 
                     style="background:${def.hex}; ${borderStyle}" 
                     onclick="setPlayerColor(${idx}, '${key}')">
                </div>`;
        });

        card.innerHTML = `
            <div class="player-name-row">
                <span class="player-label">Name</span>
                <input type="text" class="player-input" value="${p.name}" data-idx="${idx}" onchange="updatePlayerName(this)" placeholder="Name">
            </div>
            <div class="color-picker">
                ${colorPickerHtml}
            </div>
        `;
        playersContainer.appendChild(card);
    });

    playerCountDisplay.innerText = `${players.length}`;
    addPlayerBtn.disabled = players.length >= MAX_PLAYERS;
    removePlayerBtn.disabled = players.length <= MIN_PLAYERS;
}

window.updatePlayerName = (input) => { players[input.dataset.idx].name = input.value; };

// SMART SWAP LOGIC
window.setPlayerColor = (playerIdx, newColorKey) => {
    // 1. Prüfen, wer die Farbe aktuell hat
    const otherPlayerIdx = players.findIndex(p => p.colorKey === newColorKey);
    const oldColorKey = players[playerIdx].colorKey;

    if (otherPlayerIdx !== -1 && otherPlayerIdx !== playerIdx) {
        // Tauschen! Der andere bekommt meine alte Farbe
        players[otherPlayerIdx].colorKey = oldColorKey;
    }
    
    // Neue Farbe setzen
    players[playerIdx].colorKey = newColorKey;
    renderPlayers(); // UI neu zeichnen
};

addPlayerBtn.addEventListener('click', () => {
    if (players.length < MAX_PLAYERS) {
        // Freie Farbe finden
        const taken = players.map(p => p.colorKey);
        const freeKey = Object.keys(COLOR_DEFS).find(k => !taken.includes(k)) || 'white';
        players.push({ name: `Spieler ${players.length+1}`, colorKey: freeKey, score: 0 });
        renderPlayers();
    }
});

removePlayerBtn.addEventListener('click', () => {
    if (players.length > MIN_PLAYERS) { players.pop(); renderPlayers(); }
});

// --- NAVIGATION ---
const views = document.querySelectorAll('.view');
const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('side-menu-overlay');

function toggleMenu() { sideMenu.classList.toggle('open'); menuOverlay.classList.toggle('open'); }
menuBtn.onclick = toggleMenu;
menuOverlay.onclick = toggleMenu;

function switchView(id) {
    sideMenu.classList.remove('open'); menuOverlay.classList.remove('open');
    views.forEach(v => v.classList.remove('active-view'));
    document.getElementById(id).classList.add('active-view');
    activeViewId = id;
    fabHome.classList.toggle('hidden', id === 'view-setup');

    if (id === 'view-game') startCamera();
    else { stopCamera(); stopAutoScan(); }
    if (id === 'view-history') renderHistory();
}

document.querySelectorAll('.menu-item').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.menu-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        switchView(btn.getAttribute('data-target'));
    };
});
fabHome.onclick = () => switchView('view-setup');

document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { stopCamera(); stopAutoScan(); } 
    else { if (activeViewId === 'view-game') setTimeout(startCamera, 300); }
});

// --- GAME ---
startBtn.addEventListener('click', () => {
    resetGameUI();
    switchView('view-game');
});
nextGameBtn.addEventListener('click', () => switchView('view-setup'));

function resetGameUI() {
    controlsSheet.classList.add('hidden');
    canvas.style.display = 'none'; video.style.display = 'block';
    instructionText.innerText = "Ziele auf das Brett...";
    instructionText.classList.remove('scanning');
    instructionText.style.background = "rgba(0,0,0,0.6)";
    scanLine.classList.add('hidden');
    stabilityCounter = 0;
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
    scanInterval = setInterval(runTargetCheck, 200);
}
function stopAutoScan() { isScanning = false; clearInterval(scanInterval); scanLine.classList.add('hidden'); instructionText.classList.remove('scanning'); }

// --- SCANNING (Gleiche Logik wie v9) ---
function runTargetCheck() {
    if (!video.videoWidth) return;
    const w = 320; const h = 240;
    const smallCanvas = document.createElement('canvas'); smallCanvas.width = w; smallCanvas.height = h;
    smallCanvas.getContext('2d').drawImage(video, 0, 0, w, h);
    let src = cv.imread(smallCanvas); let hsv = new cv.Mat();
    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        let roiRect = new cv.Rect(Math.floor(w*0.2), Math.floor(h*0.2), Math.floor(w*0.6), Math.floor(h*0.6));
        let roi = hsv.roi(roiRect);
        let totalColoredPixels = 0;
        players.forEach(p => {
            let mask = new cv.Mat(); let c = COLOR_DEFS[p.colorKey];
            let low = new cv.Mat(roi.rows, roi.cols, roi.type(), c.hsvLow); let high = new cv.Mat(roi.rows, roi.cols, roi.type(), c.hsvHigh);
            cv.inRange(roi, low, high, mask); totalColoredPixels += cv.countNonZero(mask);
            mask.delete(); low.delete(); high.delete();
        });
        if (totalColoredPixels > (roiRect.width * roiRect.height * 0.015)) {
            stabilityCounter++;
            let p = Math.min(100, Math.round((stabilityCounter/REQUIRED_STABILITY)*100));
            instructionText.innerText = `Erkenne Spiel... ${p}%`;
            instructionText.classList.add('scanning'); instructionText.style.background = "var(--nxt-teal)";
            if (stabilityCounter >= REQUIRED_STABILITY) triggerFullAnalysis();
        } else {
            stabilityCounter = Math.max(0, stabilityCounter - 1);
            if (stabilityCounter === 0) { instructionText.innerText = "Ziele auf das Brett..."; instructionText.classList.remove('scanning'); instructionText.style.background = "rgba(0,0,0,0.6)"; }
        }
        src.delete(); hsv.delete(); roi.delete();
    } catch(e) { stopAutoScan(); }
}

function triggerFullAnalysis() {
    stopAutoScan(); instructionText.innerText = "Auswertung...";
    if(navigator.vibrate) navigator.vibrate([100]);
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
            // Gummiband-Filter
            let kernel = cv.Mat.ones(4, 4, cv.CV_8U); cv.erode(mask, mask, kernel); cv.dilate(mask, mask, kernel);
            cv.findContours(mask, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
            p.score = 0; for(let i=0; i<contours.size(); i++) { if(cv.contourArea(contours.get(i)) > 300) p.score++; }
            mask.delete(); low.delete(); high.delete();
        });
        finishGameAndSave();
        src.delete(); hsv.delete(); roi.delete(); contours.delete();
    } catch(e) { console.error(e); }
}

// --- RANKING & RESULTS ---
function finishGameAndSave() {
    controlsSheet.classList.remove('hidden');
    scoreList.innerHTML = '';
    
    // Sortieren für Ranking
    const rankedPlayers = [...players].sort((a,b) => b.score - a.score);
    const winner = rankedPlayers[0];
    
    // Speichern
    let history = JSON.parse(localStorage.getItem('nxt_games_v10')) || [];
    history.push({ date: new Date().toISOString(), winner: winner.name, topScore: winner.score, players: players.map(p=>({n:p.name, s:p.score})) });
    localStorage.setItem('nxt_games_v10', JSON.stringify(history));

    // UI Rendern (Rank Cards)
    rankedPlayers.forEach((p, idx) => {
        const rank = idx + 1;
        let rankClass = '';
        if (rank === 1) rankClass = 'rank-1 winner-glow';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';
        
        const div = document.createElement('div');
        div.className = `rank-card ${rankClass}`;
        const colorHex = COLOR_DEFS[p.colorKey].hex;
        
        div.innerHTML = `
            <div class="rank-info">
                <div class="rank-pos">${rank}</div>
                <div class="rank-dot" style="background:${colorHex}"></div>
                <span class="rank-name">${p.name}</span>
            </div>
            <span class="rank-score">${p.score}</span>
        `;
        scoreList.appendChild(div);
    });

    if (winner.score > 0) {
        winnerMsg.innerText = "Ergebnis";
        // Feuerwerk
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, zIndex: 1000 });
    } else {
        winnerMsg.innerText = "Keine Figuren?";
    }
}

retryBtn.onclick = () => { resetGameUI(); startAutoScan(); if(video.paused) video.play(); };

// --- HISTORY MIT GEWINNER ---
function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_games_v10')) || [];
    historyList.innerHTML = '';
    if(history.length === 0) { historyList.innerHTML = '<div class="empty-state">Keine Einträge</div>'; return; }
    
    history.slice().reverse().forEach(g => {
        let time = new Date(g.date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        // Zeige Gewinner groß, Rest klein
        const winner = g.winner || "Unbekannt";
        const details = g.players.map(p => `${p.n}: ${p.s}`).join(', ');
        
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `
            <div style="flex:1;">
                <div class="hist-winner">🏆 ${winner} (${g.topScore})</div>
                <div style="font-size:0.75rem;color:#666;margin-top:2px;">${details}</div>
            </div>
            <div style="font-size:0.7rem;color:#999;text-align:right;">${time}</div>
        `;
        historyList.appendChild(div);
    });
}

deleteBtn.onclick = () => { if(confirm('Löschen?')) { localStorage.removeItem('nxt_games_v10'); renderHistory(); } };

renderPlayers();
checkIOS();
function checkIOS() { const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; const isStandalone = window.matchMedia('(display-mode: standalone)').matches; if (isIOS && !isStandalone) { const p = document.getElementById('ios-install-prompt'); setTimeout(() => p.classList.remove('hidden'), 2000); document.getElementById('close-prompt').onclick = () => p.classList.add('hidden'); } }