document.addEventListener("DOMContentLoaded", () => {
    console.log("NXTgame v18.0 Grid-Lock gestartet");
    initGame();
});

// --- 1. DAS SPIELFELD (GRID) ---
// Koordinaten in mm relativ zur Mitte (0,0), basierend auf deiner CSV.
// X ist horizontal, Y vertikal.
const PIN_GRID = [
    { id: 1, x: -112.5, y: -64.95 }, { id: 2, x: -112.5, y: -21.65 }, { id: 3, x: -112.5, y: 21.65 }, { id: 4, x: -112.5, y: 64.95 },
    { id: 5, x: -75.0, y: -86.60 }, { id: 6, x: -75.0, y: -43.30 }, { id: 7, x: -75.0, y: 0.00 }, { id: 8, x: -75.0, y: 43.30 }, { id: 9, x: -75.0, y: 86.60 },
    { id: 10, x: -37.5, y: -108.25 }, { id: 11, x: -37.5, y: -64.95 }, { id: 12, x: -37.5, y: -21.65 }, { id: 13, x: -37.5, y: 21.65 }, { id: 14, x: -37.5, y: 64.95 }, { id: 15, x: -37.5, y: 108.25 },
    { id: 16, x: 0.0, y: -129.90 }, { id: 17, x: 0.0, y: -86.60 }, { id: 18, x: 0.0, y: -43.30 }, { id: 19, x: 0.0, y: 0.00 }, { id: 20, x: 0.0, y: 43.30 }, { id: 21, x: 0.0, y: 86.60 }, { id: 22, x: 0.0, y: 129.90 },
    { id: 23, x: 37.5, y: -108.25 }, { id: 24, x: 37.5, y: -64.95 }, { id: 25, x: 37.5, y: -21.65 }, { id: 26, x: 37.5, y: 21.65 }, { id: 27, x: 37.5, y: 64.95 }, { id: 28, x: 37.5, y: 108.25 },
    { id: 29, x: 75.0, y: -86.60 }, { id: 30, x: 75.0, y: -43.30 }, { id: 31, x: 75.0, y: 0.00 }, { id: 32, x: 75.0, y: 43.30 }, { id: 33, x: 75.0, y: 86.60 },
    { id: 34, x: 112.5, y: -64.95 }, { id: 35, x: 112.5, y: -21.65 }, { id: 36, x: 112.5, y: 21.65 }, { id: 37, x: 112.5, y: 64.95 }
];

// Physische Größe des Bretts (Breite Seite-zu-Seite in mm)
const BOARD_WIDTH_MM = 250; 

// --- CONFIG ---
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

const COLORS = {
    magenta: { name: 'Magenta', hex: '#D500F9', hsvLow: [140, 60, 60, 0], hsvHigh: [175, 255, 255, 255] },
    yellow:  { name: 'Gelb',    hex: '#FFD600', hsvLow: [20, 80, 80, 0],  hsvHigh: [40, 255, 255, 255] },
    blue:    { name: 'Blau',    hex: '#2962FF', hsvLow: [100, 80, 50, 0], hsvHigh: [135, 255, 255, 255] },
    green:   { name: 'Grün',    hex: '#00C853', hsvLow: [40, 60, 50, 0],  hsvHigh: [85, 255, 255, 255] }
};

let players = [ { name: 'Spieler 1', colorKey: 'magenta', score: 0 }, { name: 'Spieler 2', colorKey: 'yellow', score: 0 } ];
let cvReady = false;
let streamObject = null;
let isScanning = false;
let scanInterval = null;
let stabilityCounter = 0;
const REQUIRED_STABILITY = 6; 

// ELEMENTS
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

function onOpenCvReady() { console.log("OpenCV Ready"); cvReady = true; }

// --- PLAYER MANAGEMENT ---
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

// --- NAVIGATION ---
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

// --- SCANNING LOGIC ---
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

let foundBoardInfo = null; // Speichert {rect, rotation}

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

        // Check if big enough (Board)
        if (maxArea > (w * h * 0.15)) {
            // Check Hexagon Shape
            let peri = cv.arcLength(bestContour, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(bestContour, approx, 0.04 * peri, true);
            
            // Wenn 6 Ecken, ist es unser Brett
            if (approx.rows === 6) {
                stabilityCounter++;
                let p = Math.min(100, Math.round((stabilityCounter/REQUIRED_STABILITY)*100));
                elements.instructionText.innerText = `Brett erkannt... ${p}%`;
                elements.instructionText.classList.add('success');
                
                let rect = cv.boundingRect(bestContour);
                let scaleX = elements.video.videoWidth / w; 
                let scaleY = elements.video.videoHeight / h;
                
                // Wir nehmen an, dass das Brett relativ gerade liegt. 
                // Wir speichern das Rechteck für die Analyse.
                foundBoardInfo = {
                    x: Math.max(0, rect.x * scaleX),
                    y: Math.max(0, rect.y * scaleY),
                    w: Math.min(elements.video.videoWidth, rect.width * scaleX),
                    h: Math.min(elements.video.videoHeight, rect.height * scaleY)
                };

                if (stabilityCounter >= REQUIRED_STABILITY) {
                    elements.lockOverlay.classList.remove('hidden'); elements.lockOverlay.classList.add('flash');
                    setTimeout(triggerFullAnalysis, 600);
                }
            } else {
                // Instabil, wenn Form nicht Hexagon
                stabilityCounter = Math.max(0, stabilityCounter - 2); 
            }
            approx.delete();
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
    analyzeWithGrid();
}

// --- NEW ANALYSIS: GRID BASED ---
function analyzeWithGrid() {
    if (!foundBoardInfo) return;

    let src = cv.imread(elements.canvas);
    let hsv = new cv.Mat();
    
    try {
        // Wir schneiden das Brett aus
        let roiRect = new cv.Rect(foundBoardInfo.x, foundBoardInfo.y, foundBoardInfo.w, foundBoardInfo.h);
        let roi = src.roi(roiRect);
        
        cv.cvtColor(roi, hsv, cv.COLOR_RGBA2RGB); 
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        
        // Berechne Skalierungsfaktor: Pixel pro mm
        // Wir nutzen die Breite des erkannten Rechtecks
        const pxPerMm = foundBoardInfo.w / BOARD_WIDTH_MM;
        
        // Mitte des ROIs
        const centerX = foundBoardInfo.w / 2;
        const centerY = foundBoardInfo.h / 2;

        players.forEach(p => {
            p.score = 0;
            // Wir prüfen JEDEN Pin im Grid einzeln
            PIN_GRID.forEach(pin => {
                // Berechne Pixel-Position im ROI
                // Hinweis: Y-Achse im Bild ist positiv nach unten, im Grid evtl. anders.
                // In CSV war Y positiv nach oben? Prüfen wir. 
                // Im CSV Bild ID 37 (oben rechts?) war Y positiv. 
                // Im Bild ist Y=0 oben. Also müssen wir Y umkehren oder anpassen.
                // Annahme: CSV (0,0) ist Mitte. Y+ ist oben. Bild Y+ ist unten.
                // -> pixelY = centerY - (pin.y * pxPerMm)
                
                let px = Math.floor(centerX + (pin.x * pxPerMm));
                let py = Math.floor(centerY - (pin.y * pxPerMm)); // Minus Y wegen Koordinatensystem
                
                // Prüfe Farbe in einem kleinen Radius um diesen Punkt (z.B. 10px Radius)
                if (px > 0 && px < roi.cols && py > 0 && py < roi.rows) {
                    if (checkColorAt(hsv, px, py, p.colorKey)) {
                        p.score++;
                        // Optional: Zeichne Kreis für Debugging
                        cv.circle(roi, new cv.Point(px, py), 10, new cv.Scalar(0, 255, 0, 255), 2);
                    } else {
                        cv.circle(roi, new cv.Point(px, py), 5, new cv.Scalar(255, 255, 255, 100), 1);
                    }
                }
            });
        });
        
        cv.imshow('canvas', roi); // Zeige Ergebnis mit Kreisen
        finishGameAndSave();
        
        src.delete(); hsv.delete(); roi.delete();
    } catch(e) { console.error(e); }
}

function checkColorAt(hsvMat, x, y, colorKey) {
    // Hole Pixelwerte in kleinem Bereich (3x3 Durchschnitt für Stabilität)
    // Wir nehmen einfach den Center Pixel für Performance, oder eine kleine ROI
    let radius = 6; // Radius in Pixeln, in dem wir suchen
    let matchedPixels = 0;
    let totalPixels = 0;
    
    let c = COLOR_DEFS[colorKey];
    
    // Einfache Bounding Box um den Pin
    let startX = Math.max(0, x - radius);
    let startY = Math.max(0, y - radius);
    let endX = Math.min(hsvMat.cols, x + radius);
    let endY = Math.min(hsvMat.rows, y + radius);
    
    // Scanne Bereich
    for(let i=startX; i<endX; i+=2) { // Step 2 für Speed
        for(let j=startY; j<endY; j+=2) {
            let pixel = hsvMat.ucharPtr(j, i); // H, S, V
            let h = pixel[0];
            let s = pixel[1];
            let v = pixel[2];
            
            // Check Range
            if (h >= c.hsvLow[0] && h <= c.hsvHigh[0] &&
                s >= c.hsvLow[1] && s <= c.hsvHigh[1] &&
                v >= c.hsvLow[2] && v <= c.hsvHigh[2]) {
                matchedPixels++;
            }
            totalPixels++;
        }
    }
    
    // Wenn mehr als 30% der Pixel passen, ist die Figur da
    return (matchedPixels / totalPixels) > 0.3;
}

function finishGameAndSave() {
    elements.controlsSheet.classList.remove('hidden');
    elements.scoreList.innerHTML = '';
    const rankedPlayers = [...players].sort((a,b) => b.score - a.score);
    const winner = rankedPlayers[0];
    
    let history = JSON.parse(localStorage.getItem('nxt_games_v18')) || [];
    history.push({ date: new Date().toISOString(), winner: winner.name, topScore: winner.score, players: players.map(p=>({n:p.name, s:p.score})) });
    localStorage.setItem('nxt_games_v18', JSON.stringify(history));

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
    let history = JSON.parse(localStorage.getItem('nxt_games_v18')) || [];
    const list = document.getElementById('history-list'); if(!list) return;
    list.innerHTML = '';
    if(history.length === 0) { list.innerHTML = '<div class="empty-state">Keine Einträge</div>'; return; }
    history.slice().reverse().forEach(g => {
        let time = new Date(g.date).toLocaleDateString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
        const details = g.players.map(p => `${p.n}: ${p.s}`).join(', ');
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `<div><div class="hist-winner">🏆 ${g.winner} (${g.topScore})</div><div style="font-size:0.75rem;color:#666;">${details}</div></div><div style="font-size:0.7rem;color:#999;">${time}</div>`;
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

if(document.getElementById('delete-btn')) { document.getElementById('delete-btn').onclick = () => { if(confirm('Verlauf löschen?')) { localStorage.removeItem('nxt_games_v18'); renderHistory(); } }; }