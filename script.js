document.addEventListener("DOMContentLoaded", () => {
    console.log("NXTgame v18.4 Grid-Logic gestartet");
    initGame();
});

// --- 1. DAS GRID (Aus deiner CSV) ---
// X/Y in mm, relativ zur Mitte.
const PIN_GRID = [
    { id: 1, x: -112.5, y: -64.95 }, { id: 2, x: -112.5, y: -21.65 }, { id: 3, x: -112.5, y: 21.65 }, { id: 4, x: -112.5, y: 64.95 },
    { id: 5, x: -75.0, y: -86.60 }, { id: 6, x: -75.0, y: -43.30 }, { id: 7, x: -75.0, y: 0.00 }, { id: 8, x: -75.0, y: 43.30 }, { id: 9, x: -75.0, y: 86.60 },
    { id: 10, x: -37.5, y: -108.25 }, { id: 11, x: -37.5, y: -64.95 }, { id: 12, x: -37.5, y: -21.65 }, { id: 13, x: -37.5, y: 21.65 }, { id: 14, x: -37.5, y: 64.95 }, { id: 15, x: -37.5, y: 108.25 },
    { id: 16, x: 0.0, y: -129.90 }, { id: 17, x: 0.0, y: -86.60 }, { id: 18, x: 0.0, y: -43.30 }, { id: 19, x: 0.0, y: 0.00 }, { id: 20, x: 0.0, y: 43.30 }, { id: 21, x: 0.0, y: 86.60 }, { id: 22, x: 0.0, y: 129.90 },
    { id: 23, x: 37.5, y: -108.25 }, { id: 24, x: 37.5, y: -64.95 }, { id: 25, x: 37.5, y: -21.65 }, { id: 26, x: 37.5, y: 21.65 }, { id: 27, x: 37.5, y: 64.95 }, { id: 28, x: 37.5, y: 108.25 },
    { id: 29, x: 75.0, y: -86.60 }, { id: 30, x: 75.0, y: -43.30 }, { id: 31, x: 75.0, y: 0.00 }, { id: 32, x: 75.0, y: 43.30 }, { id: 33, x: 75.0, y: 86.60 },
    { id: 34, x: 112.5, y: -64.95 }, { id: 35, x: 112.5, y: -21.65 }, { id: 36, x: 112.5, y: 21.65 }, { id: 37, x: 112.5, y: 64.95 }
];
// Radius (Mitte zu Ecke) in mm
const BOARD_RADIUS_MM = 140; 

// --- CONFIG ---
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

const COLORS = {
    magenta: { name: 'Magenta', hex: '#D500F9', hsvLow: [135, 50, 50, 0], hsvHigh: [175, 255, 255, 255] },
    yellow:  { name: 'Gelb',    hex: '#FFD600', hsvLow: [15, 80, 80, 0],  hsvHigh: [40, 255, 255, 255] },
    blue:    { name: 'Blau',    hex: '#2962FF', hsvLow: [95, 80, 50, 0],  hsvHigh: [130, 255, 255, 255] },
    green:   { name: 'Grün',    hex: '#00C853', hsvLow: [40, 50, 50, 0],  hsvHigh: [90, 255, 255, 255] }
};

let players = [{name:'Spieler 1', colorKey:'magenta', score:0}, {name:'Spieler 2', colorKey:'yellow', score:0}];
let cvReady = false;
let streamObject = null;
let isScanning = false;
let scanInterval = null;
let stabilityCounter = 0;
let detectedBoard = null;

// Elemente-Cache
let elements = {};

function onOpenCvReady() { console.log("OpenCV Ready"); cvReady = true; }

function initGame() {
    // Elemente sicher abrufen
    elements = {
        video: document.getElementById('video'),
        canvas: document.getElementById('canvas'),
        overlayCanvas: document.getElementById('overlay-canvas'),
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
        closeInstallBtn: document.getElementById('close-install'),
        menuBtn: document.getElementById('menu-btn'),
        sideMenu: document.getElementById('side-menu'),
        menuOverlay: document.getElementById('side-menu-overlay')
    };

    renderPlayers();
    checkInstallState();
    
    // UI Event Listeners
    if(elements.menuBtn) elements.menuBtn.onclick = () => { elements.sideMenu.classList.toggle('open'); elements.menuOverlay.classList.toggle('open'); };
    if(elements.menuOverlay) elements.menuOverlay.onclick = () => { elements.sideMenu.classList.remove('open'); elements.menuOverlay.classList.remove('open'); };
    
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.onclick = () => {
            elements.sideMenu.classList.remove('open'); elements.menuOverlay.classList.remove('open');
            switchView(btn.dataset.target);
        };
    });

    if(elements.startBtn) elements.startBtn.onclick = () => switchView('view-game');
    
    if(elements.addPlayerBtn) elements.addPlayerBtn.onclick = () => { 
        if(players.length<4) { players.push({name:`S${players.length+1}`, colorKey:'blue', score:0}); renderPlayers(); }
    };
    if(elements.removePlayerBtn) elements.removePlayerBtn.onclick = () => { 
        if(players.length>2) { players.pop(); renderPlayers(); }
    };
    
    if(elements.randomStartBtn) elements.randomStartBtn.onclick = runRandomStarter;
    
    if(elements.nextGameBtn) elements.nextGameBtn.onclick = () => switchView('view-setup');
    
    if(elements.retryBtn) elements.retryBtn.onclick = () => {
        elements.controlsSheet.classList.add('hidden');
        resetGameUI();
        startAutoScan();
        if(elements.video.paused) elements.video.play();
    };
    
    if(elements.installDismissBtn) elements.installDismissBtn.onclick = () => elements.installModal.classList.add('hidden');
    if(elements.closeInstallBtn) elements.closeInstallBtn.onclick = () => elements.installModal.classList.add('hidden');
}

function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    const view = document.getElementById(id);
    if(view) view.classList.add('active-view');
    if(id === 'view-game') startCamera(); else { stopCamera(); stopAutoScan(); }
    if(id === 'view-history') renderHistory();
}

// --- CORE LOGIC: BOARD DETECTION & GRID ---
function resetGameUI() {
    elements.controlsSheet.classList.add('hidden');
    elements.canvas.style.display = 'none'; 
    elements.video.style.display = 'block';
    elements.instructionText.innerText = "Suche Spielfeld...";
    elements.instructionText.classList.remove('success');
    // Clear Overlay
    if(elements.overlayCanvas) {
        const ctx = elements.overlayCanvas.getContext('2d');
        ctx.clearRect(0,0, elements.overlayCanvas.width, elements.overlayCanvas.height);
    }
    stabilityCounter = 0;
}

async function startCamera() {
    try {
        streamObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        elements.video.srcObject = streamObject;
        elements.video.onloadedmetadata = () => { elements.video.play(); startAutoScan(); };
    } catch(e) { console.log(e); alert("Kamera-Zugriff verweigert oder nicht möglich."); }
}
function stopCamera() { if(streamObject) streamObject.getTracks().forEach(t=>t.stop()); }

function startAutoScan() {
    if(isScanning || !cvReady) return;
    isScanning = true;
    scanInterval = setInterval(runBoardCheck, 150);
}
function stopAutoScan() { isScanning = false; clearInterval(scanInterval); }

function runBoardCheck() {
    if (!elements.video.videoWidth) return;
    const w = 320; const h = 240;
    const smallCanvas = document.createElement('canvas'); smallCanvas.width = w; smallCanvas.height = h;
    smallCanvas.getContext('2d').drawImage(elements.video, 0, 0, w, h);
    
    let src = cv.imread(smallCanvas);
    let gray = new cv.Mat(); let binary = new cv.Mat(); let contours = new cv.MatVector();
    
    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        // Starker Blur um Details (Löcher) zu ignorieren und nur die Form zu sehen
        cv.GaussianBlur(gray, gray, new cv.Size(7, 7), 0);
        cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        
        cv.findContours(binary, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        let maxArea = 0; let bestContour = null;
        for(let i=0; i<contours.size(); i++) {
            let cnt = contours.get(i);
            let area = cv.contourArea(cnt);
            if (area > maxArea) { maxArea = area; bestContour = cnt; }
        }

        // Overlay Setup
        if(elements.overlayCanvas) {
            elements.overlayCanvas.width = elements.video.videoWidth;
            elements.overlayCanvas.height = elements.video.videoHeight;
            const ctx = elements.overlayCanvas.getContext('2d');
            ctx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);

            // Ist das Objekt groß genug?
            if (maxArea > (w * h * 0.15)) {
                // Wir nutzen den umschließenden Kreis (stabiler als Ecken-Erkennung bei Kerben)
                let circle = cv.minEnclosingCircle(bestContour);
                
                // Hochskalieren auf Video-Größe
                let scaleX = elements.video.videoWidth / w;
                let scaleY = elements.video.videoHeight / h;
                
                detectedBoard = {
                    x: circle.center.x * scaleX,
                    y: circle.center.y * scaleY,
                    r: circle.radius * Math.max(scaleX, scaleY)
                };

                // --- VISUAL DEBUG GRID ---
                // Zeichne das Grid auf das Overlay
                const pxPerMm = detectedBoard.r / BOARD_RADIUS_MM;
                ctx.fillStyle = "rgba(255, 235, 59, 0.8)"; // Leuchtendes Gelb
                
                PIN_GRID.forEach(pin => {
                    let px = detectedBoard.x + (pin.x * pxPerMm);
                    let py = detectedBoard.y + (pin.y * pxPerMm);
                    ctx.beginPath();
                    ctx.arc(px, py, 5, 0, 2 * Math.PI);
                    ctx.fill();
                });

                stabilityCounter++;
                elements.instructionText.innerText = "Grid erkannt! Stillhalten...";
                elements.instructionText.classList.add('success');

                if (stabilityCounter > 12) { // 12 Frames stabil = ca 2 Sekunden
                    stopAutoScan();
                    elements.instructionText.innerText = "Analysiere...";
                    analyzeWithGrid();
                }
            } else {
                stabilityCounter = Math.max(0, stabilityCounter - 1);
                elements.instructionText.innerText = "Suche Spielfeld...";
                elements.instructionText.classList.remove('success');
            }
        }
        
        src.delete(); gray.delete(); binary.delete(); contours.delete();
    } catch(e) { console.error(e); stopAutoScan(); }
}

function analyzeWithGrid() {
    // Snapshot erstellen
    elements.canvas.width = elements.video.videoWidth;
    elements.canvas.height = elements.video.videoHeight;
    elements.canvas.getContext('2d').drawImage(elements.video, 0, 0);
    elements.video.style.display = 'none';
    elements.canvas.style.display = 'block';
    
    let src = cv.imread(elements.canvas);
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
    
    const pxPerMm = detectedBoard.r / BOARD_RADIUS_MM;
    
    players.forEach(p => {
        p.score = 0;
        let c = COLORS[p.colorKey];
        
        PIN_GRID.forEach(pin => {
            let px = Math.floor(detectedBoard.x + (pin.x * pxPerMm));
            let py = Math.floor(detectedBoard.y + (pin.y * pxPerMm));
            
            // Check Color at Position (Radius 8px)
            if(px > 0 && px < hsv.cols && py > 0 && py < hsv.rows) {
                let matchCount = 0;
                let totalCount = 0;
                let rad = 8;
                
                for(let ix = px-rad; ix < px+rad; ix+=2) {
                    for(let iy = py-rad; iy < py+rad; iy+=2) {
                        let pixel = hsv.ucharPtr(iy, ix);
                        if(pixel[0] >= c.hsvLow[0] && pixel[0] <= c.hsvHigh[0] &&
                           pixel[1] >= c.hsvLow[1] && pixel[1] <= c.hsvHigh[1]) {
                            matchCount++;
                        }
                        totalCount++;
                    }
                }
                // Wenn mehr als 20% der Pixel im Kreis die Farbe haben -> Treffer
                if((matchCount/totalCount) > 0.20) {
                    p.score++;
                }
            }
        });
    });
    
    src.delete(); hsv.delete();
    finishGameAndSave();
}

function finishGameAndSave() {
    elements.controlsSheet.classList.remove('hidden');
    elements.scoreList.innerHTML = '';
    const ranked = [...players].sort((a,b) => b.score - a.score);
    
    let hist = JSON.parse(localStorage.getItem('nxt_games_v18')) || [];
    hist.push({ date: new Date().toISOString(), winner: ranked[0].name, topScore: ranked[0].score, players: players.map(p=>({n:p.name, s:p.score})) });
    localStorage.setItem('nxt_games_v18', JSON.stringify(hist));

    ranked.forEach((p, i) => {
        elements.scoreList.innerHTML += `<div class="rank-card ${i===0?'rank-1':''}"><div style="display:flex;align-items:center;gap:10px;"><span class="rank-pos">${i+1}</span><span>${p.name}</span><div class="rank-dot" style="background:${COLORS[p.colorKey].hex}"></div></div><span class="rank-score">${p.score}</span></div>`;
    });
    
    if(ranked[0].score > 0) confetti({particleCount:100, spread:70, origin:{y:0.6}});
}

// --- UI HELPER ---
function renderPlayers() {
    if(!elements.playersContainer) return;
    elements.playersContainer.innerHTML = '';
    players.forEach((p, idx) => {
        let dots = ''; Object.keys(COLORS).forEach(k => dots += `<div class="color-option ${p.colorKey===k?'active':''}" style="background:${COLORS[k].hex}" onclick="setPlayerColor(${idx}, '${k}')"></div>`);
        elements.playersContainer.innerHTML += `<div class="player-card"><div class="player-name-row"><span class="player-label">Name</span><input class="player-input" value="${p.name}" onchange="updatePlayerName(this)" data-idx="${idx}"></div><div class="color-picker">${dots}</div></div>`;
    });
    elements.playerCountDisplay.innerText = players.length;
}

window.updatePlayerName = (input) => { players[input.dataset.idx].name = input.value; };
window.setPlayerColor = (idx, key) => { players[idx].colorKey = key; renderPlayers(); };

function runRandomStarter() {
    elements.randomResultDisplay.classList.remove('hidden');
    elements.randomResultDisplay.innerText = "Würfle...";
    setTimeout(() => {
        elements.randomResultDisplay.innerText = players[Math.floor(Math.random()*players.length)].name + " beginnt!";
    }, 1000);
}

function renderHistory() {
    let hist = JSON.parse(localStorage.getItem('nxt_games_v18')) || [];
    const list = document.getElementById('history-list');
    if(!list) return;
    list.innerHTML = hist.length ? '' : '<div class="empty-state">Keine Einträge</div>';
    hist.slice().reverse().forEach(g => {
        let d = new Date(g.date).toLocaleDateString('de-DE');
        let details = g.players.map(p => `${p.n}: ${p.s}`).join(', ');
        list.innerHTML += `<div class="history-item"><div><strong>🏆 ${g.winner} (${g.topScore})</strong><br><small>${details}</small></div><small>${d}</small></div>`;
    });
}

function checkInstallState() {
    if (!elements.installModal) return;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    if (isIOS) {
        elements.installInstructions.innerHTML = `1. Tippe unten auf <span class="step-icon icon-ios-share"></span><br>2. Wähle <strong>"Zum Home-Bildschirm"</strong>`;
        setTimeout(() => elements.installModal.classList.remove('hidden'), 2000);
    } else if (isAndroid) {
        elements.installInstructions.innerHTML = `1. Tippe oben auf <span class="step-icon icon-android-menu"></span><br>2. Wähle <strong>"App installieren"</strong>`;
        setTimeout(() => elements.installModal.classList.remove('hidden'), 2000);
    }
}

if(document.getElementById('delete-btn')) { 
    document.getElementById('delete-btn').onclick = () => { 
        if(confirm('Verlauf löschen?')) { localStorage.removeItem('nxt_games_v18'); renderHistory(); } 
    }; 
}