const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startBtn = document.getElementById('start-game-btn');
const resultDisplay = document.getElementById('result-display');
const controlsSheet = document.getElementById('controls-sheet');
const instructionText = document.getElementById('instruction-text');
const scanLine = document.getElementById('scan-line');
const statusPill = document.getElementById('status-pill');

const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');
const cardP1 = document.getElementById('card-p1');
const cardP2 = document.getElementById('card-p2');
const winnerMsg = document.getElementById('winner-msg');
const nextGameBtn = document.getElementById('next-game-btn');
const retryBtn = document.getElementById('retry-btn');
const p1Input = document.getElementById('p1-name');
const p2Input = document.getElementById('p2-name');
const resLabelP1 = document.getElementById('res-label-p1');
const resLabelP2 = document.getElementById('res-label-p2');

const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('side-menu-overlay');
const menuItems = document.querySelectorAll('.menu-item');
const fabHome = document.getElementById('fab-home');
const views = document.querySelectorAll('.view');
const historyList = document.getElementById('history-list');
const deleteBtn = document.getElementById('delete-btn');

let cvReady = false;
let streamObject = null;
let currentResult = { p1: 0, p2: 0 };
let activeViewId = 'view-setup';

let isScanning = false;
let scanInterval = null;
let stabilityCounter = 0;
// Stabilität (ca. 1 Sekunde bei 200ms Interval)
const REQUIRED_STABILITY = 5; 

function onOpenCvReady() { console.log("NXT Engine Ready"); cvReady = true; }

// --- NAVIGATION ---
function toggleMenu() { sideMenu.classList.toggle('open'); menuOverlay.classList.toggle('open'); }
function switchView(targetId) {
    sideMenu.classList.remove('open'); menuOverlay.classList.remove('open');
    views.forEach(v => v.classList.remove('active-view'));
    document.getElementById(targetId).classList.add('active-view');
    activeViewId = targetId;
    fabHome.classList.toggle('hidden', targetId === 'view-setup');

    if (targetId === 'view-game') { startCamera(); } else { stopCamera(); stopAutoScan(); }
    if (targetId === 'view-history') renderHistory();
}

menuBtn.addEventListener('click', toggleMenu);
menuOverlay.addEventListener('click', toggleMenu);
fabHome.addEventListener('click', () => switchView('view-setup'));
menuItems.forEach(item => { item.addEventListener('click', () => { menuItems.forEach(i => i.classList.remove('active')); item.classList.add('active'); switchView(item.getAttribute('data-target')); }); });

document.addEventListener("visibilitychange", async () => {
    if (document.hidden) { stopCamera(); stopAutoScan(); } 
    else { if (activeViewId === 'view-game') setTimeout(startCamera, 300); }
});

// --- GAME FLOW ---
startBtn.addEventListener('click', () => {
    localStorage.setItem('nxt_p1', p1Input.value); localStorage.setItem('nxt_p2', p2Input.value);
    resLabelP1.innerText = p1Input.value || "Blau"; resLabelP2.innerText = p2Input.value || "Orange";
    resetGameUI();
    switchView('view-game');
});

nextGameBtn.addEventListener('click', () => { switchView('view-setup'); });

window.addEventListener('load', () => {
    if(localStorage.getItem('nxt_p1')) p1Input.value = localStorage.getItem('nxt_p1');
    if(localStorage.getItem('nxt_p2')) p2Input.value = localStorage.getItem('nxt_p2');
    checkIOS();
});

function resetGameUI() {
    controlsSheet.classList.add('hidden');
    cardP1.classList.remove('winner-card', 'loser-card'); cardP2.classList.remove('winner-card', 'loser-card');
    statusPill.classList.add('hidden');
    canvas.style.display = 'none'; video.style.display = 'block';
    instructionText.innerText = "Ziele auf das Brett...";
    instructionText.classList.remove('scanning');
    instructionText.style.background = "rgba(0,0,0,0.6)";
    scanLine.classList.add('hidden');
    stabilityCounter = 0;
}

// --- KAMERA ---
async function startCamera() {
    if (streamObject && streamObject.active) return;
    try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch(e){}
    const constraints = { video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } };
    try {
        streamObject = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = streamObject;
        video.onloadedmetadata = () => { 
            video.play().catch(e=>{}); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            startAutoScan(); 
        };
    } catch (err) {
        try { streamObject = await navigator.mediaDevices.getUserMedia({ video: true }); video.srcObject = streamObject; video.play(); startAutoScan(); } catch(e){}
    }
}

function stopCamera() { if (streamObject) { streamObject.getTracks().forEach(track => track.stop()); streamObject = null; } }

function startAutoScan() {
    if (isScanning || !cvReady) return;
    isScanning = true;
    scanLine.classList.remove('hidden');
    scanInterval = setInterval(runTargetCheck, 200);
}

function stopAutoScan() {
    isScanning = false;
    clearInterval(scanInterval);
    scanLine.classList.add('hidden');
}

// --- TARGET CHECK (Center, ohne Linien) ---
function runTargetCheck() {
    if (!video.videoWidth) return;
    
    const w = 320; const h = 240;
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = w; smallCanvas.height = h;
    smallCanvas.getContext('2d').drawImage(video, 0, 0, w, h);

    let src = cv.imread(smallCanvas);
    let hsv = new cv.Mat();
    let mask = new cv.Mat();

    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); 
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        
        // ROI: Mitte (60% des Bildes)
        let roiRect = new cv.Rect(Math.floor(w*0.2), Math.floor(h*0.2), Math.floor(w*0.6), Math.floor(h*0.6));
        let roi = hsv.roi(roiRect);
        let maskRoi = new cv.Mat();

        // Check: Blau ODER Orange
        let low = new cv.Mat(roi.rows, roi.cols, roi.type(), [5, 50, 50, 0]);
        let high = new cv.Mat(roi.rows, roi.cols, roi.type(), [140, 255, 255, 255]);
        cv.inRange(roi, low, high, maskRoi);
        
        // TRICK: EROSION ENTFERNT DÜNNE LINIEN (Gummis)
        let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
        cv.erode(maskRoi, maskRoi, kernel); // Macht alles dünner -> Gummis weg
        
        let colorPixels = cv.countNonZero(maskRoi);
        let totalRoiPixels = roiRect.width * roiRect.height;
        
        // 1.5% Fläche müssen Steine sein
        if (colorPixels > (totalRoiPixels * 0.015)) {
            stabilityCounter++;
            let p = Math.min(100, Math.round((stabilityCounter/REQUIRED_STABILITY)*100));
            instructionText.innerText = `Erkenne Spiel... ${p}%`;
            instructionText.classList.add('scanning');
            instructionText.style.background = "var(--nxt-teal)";
            
            if (stabilityCounter >= REQUIRED_STABILITY) {
                triggerFullAnalysis();
            }
        } else {
            stabilityCounter = Math.max(0, stabilityCounter - 1);
            if (stabilityCounter === 0) {
                instructionText.innerText = "Ziele auf das Brett...";
                instructionText.classList.remove('scanning');
                instructionText.style.background = "rgba(0,0,0,0.6)";
            }
        }

        src.delete(); hsv.delete(); mask.delete(); low.delete(); high.delete(); 
        roi.delete(); maskRoi.delete(); kernel.delete();

    } catch(e) { console.error(e); stopAutoScan(); }
}

function triggerFullAnalysis() {
    stopAutoScan();
    instructionText.innerText = "Auswertung läuft...";
    if(navigator.vibrate) navigator.vibrate([80]);
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.style.display = 'none'; canvas.style.display = 'block';

    analyzeImageFull();
}

function analyzeImageFull() {
    let src = cv.imread(canvas); let hsv = new cv.Mat();
    let maskP1 = new cv.Mat(); let maskP2 = new cv.Mat();
    let contoursP1 = new cv.MatVector(); let contoursP2 = new cv.MatVector();

    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB); cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        
        // Zentrum Fokus
        let rect = new cv.Rect(Math.floor(canvas.width*0.1), Math.floor(canvas.height*0.1), Math.floor(canvas.width*0.8), Math.floor(canvas.height*0.8));
        let roi = hsv.roi(rect);
        
        let roiMaskP1 = new cv.Mat();
        let roiMaskP2 = new cv.Mat();

        // Blau
        cv.inRange(roi, new cv.Mat(roi.rows, roi.cols, roi.type(), [90, 60, 50, 0]), new cv.Mat(roi.rows, roi.cols, roi.type(), [130, 255, 255, 255]), roiMaskP1);
        // Orange
        cv.inRange(roi, new cv.Mat(roi.rows, roi.cols, roi.type(), [0, 60, 60, 0]), new cv.Mat(roi.rows, roi.cols, roi.type(), [40, 255, 255, 255]), roiMaskP2);

        // ANTI-GUMMI LOGIK (Wichtig!)
        // Erst Erodieren (Gummis weg), dann Dilatieren (Steine wiederherstellen)
        let kernel = cv.Mat.ones(5, 5, cv.CV_8U); // Größerer Kernel für HD
        
        // Blau
        cv.erode(roiMaskP1, roiMaskP1, kernel); 
        cv.dilate(roiMaskP1, roiMaskP1, kernel);
        
        // Orange
        cv.erode(roiMaskP2, roiMaskP2, kernel); 
        cv.dilate(roiMaskP2, roiMaskP2, kernel);
        
        cv.findContours(roiMaskP1, contoursP1, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        cv.findContours(roiMaskP2, contoursP2, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        currentResult.p1 = countPieces(contoursP1); 
        currentResult.p2 = countPieces(contoursP2);
        
        finishGameAndSave(); 
        
        src.delete(); hsv.delete(); maskP1.delete(); maskP2.delete(); kernel.delete(); 
        contoursP1.delete(); contoursP2.delete(); roi.delete(); roiMaskP1.delete(); roiMaskP2.delete();
    } catch(e) { console.error(e); }
}

function countPieces(contours) {
    let count = 0;
    // Area Filter: Zu kleine Flecken ignorieren
    for (let i = 0; i < contours.size(); i++) { if (cv.contourArea(contours.get(i)) > 350) count++; }
    return count;
}

function finishGameAndSave() {
    scoreP1.innerText = currentResult.p1; scoreP2.innerText = currentResult.p2;
    const n1 = p1Input.value || "Blau"; const n2 = p2Input.value || "Orange";

    cardP1.classList.remove('winner-card', 'loser-card');
    cardP2.classList.remove('winner-card', 'loser-card');

    let winningCard = null;

    if (currentResult.p1 > currentResult.p2) {
        winnerMsg.innerText = `${n1} gewinnt! 🏆`;
        cardP1.classList.add('winner-card'); cardP2.classList.add('loser-card');
        winningCard = cardP1;
    } else if (currentResult.p2 > currentResult.p1) {
        winnerMsg.innerText = `${n2} gewinnt! 🏆`;
        cardP2.classList.add('winner-card'); cardP1.classList.add('loser-card');
        winningCard = cardP2;
    } else {
        winnerMsg.innerText = "Unentschieden";
        cardP1.classList.add('winner-card'); cardP2.classList.add('winner-card');
    }
    
    instructionText.innerText = "Ergebnis";
    controlsSheet.classList.remove('hidden');
    statusPill.classList.remove('hidden');

    let history = JSON.parse(localStorage.getItem('nxt_games_v3')) || [];
    history.push({ date: new Date().toISOString(), p1: n1, s1: currentResult.p1, p2: n2, s2: currentResult.p2 });
    localStorage.setItem('nxt_games_v3', JSON.stringify(history));

    if(winningCard) {
        shootConfettiFromCard(winningCard);
    } else {
        shootConfettiFromCard(cardP1); setTimeout(() => shootConfettiFromCard(cardP2), 200);
    }
}

function shootConfettiFromCard(cardElement) {
    const rect = cardElement.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;
    confetti({ particleCount: 80, spread: 60, origin: { x: x, y: y }, colors: ['#FFD700', '#FFA500', '#ffffff'], zIndex: 1000, disableForReducedMotion: true });
}

retryBtn.addEventListener('click', () => {
    resetGameUI();
    startAutoScan();
    if(video.paused) video.play();
});

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_games_v3')) || []; historyList.innerHTML = '';
    if(history.length === 0) { historyList.innerHTML = '<div class="empty-state">Keine Einträge</div>'; return; }
    history.slice().reverse().forEach(g => {
        let time = new Date(g.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        let badgeClass = g.s1 !== g.s2 ? 'badge-gold' : 'badge-silver';
        const div = document.createElement('div'); div.className = 'history-item';
        div.innerHTML = `<div><div style="font-weight:700; color:#333; font-size:0.95rem">${g.p1}: ${g.s1} - ${g.p2}: ${g.s2}</div><div style="font-size:0.75rem; color:#999">${time} Uhr</div></div><div class="${badgeClass}"></div>`;
        historyList.appendChild(div);
    });
}
deleteBtn.addEventListener('click', () => { if(confirm('Verlauf löschen?')) { localStorage.removeItem('nxt_games_v3'); renderHistory(); } });
function checkIOS() { const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; const isStandalone = window.matchMedia('(display-mode: standalone)').matches; if (isIOS && !isStandalone) { const p = document.getElementById('ios-install-prompt'); setTimeout(() => p.classList.remove('hidden'), 2000); document.getElementById('close-prompt').onclick = () => p.classList.add('hidden'); } }