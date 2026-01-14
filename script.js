// --- ELEMENTE ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startBtn = document.getElementById('start-game-btn');
const stopBtn = document.getElementById('stop-game-btn');
const scanBtn = document.getElementById('scan-btn');
const resultDisplay = document.getElementById('result-display');
const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');
const winnerMsg = document.getElementById('winner-msg');
const saveBtn = document.getElementById('save-btn');
const retryBtn = document.getElementById('retry-btn');
const p1Input = document.getElementById('p1-name');
const p2Input = document.getElementById('p2-name');
const resLabelP1 = document.getElementById('res-label-p1');
const resLabelP2 = document.getElementById('res-label-p2');

// Menu
const menuBtn = document.getElementById('menu-btn');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('side-menu-overlay');
const menuItems = document.querySelectorAll('.menu-item');
const views = document.querySelectorAll('.view');
const historyList = document.getElementById('history-list');
const deleteBtn = document.getElementById('delete-btn');

let cvReady = false;
let streamObject = null;
let currentResult = { p1: 0, p2: 0 };

function onOpenCvReady() { console.log("NXT Engine Ready"); cvReady = true; }

// --- NAVIGATION ---
function toggleMenu() {
    sideMenu.classList.toggle('open');
    menuOverlay.classList.toggle('open');
}

function switchView(targetId) {
    sideMenu.classList.remove('open');
    menuOverlay.classList.remove('open');
    
    views.forEach(v => v.classList.remove('active-view'));
    document.getElementById(targetId).classList.add('active-view');

    if (targetId === 'view-game') {
        startCamera();
    } else {
        stopCamera();
    }
    
    if (targetId === 'view-history') renderHistory();
}

menuBtn.addEventListener('click', toggleMenu);
menuOverlay.addEventListener('click', toggleMenu);
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        menuItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        switchView(item.getAttribute('data-target'));
    });
});

// --- GAME FLOW ---
startBtn.addEventListener('click', () => {
    localStorage.setItem('nxt_p1', p1Input.value);
    localStorage.setItem('nxt_p2', p2Input.value);
    resLabelP1.innerText = p1Input.value || "Blau";
    resLabelP2.innerText = p2Input.value || "Orange";
    switchView('view-game');
});

stopBtn.addEventListener('click', () => {
    switchView('view-setup');
});

window.addEventListener('load', () => {
    if(localStorage.getItem('nxt_p1')) p1Input.value = localStorage.getItem('nxt_p1');
    if(localStorage.getItem('nxt_p2')) p2Input.value = localStorage.getItem('nxt_p2');
    checkIOS();
});

// --- KAMERA ---
async function startCamera() {
    if (streamObject) return;
    try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch(e){}
    
    const constraints = { video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
    try {
        streamObject = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = streamObject;
        video.onloadedmetadata = () => { video.play(); canvas.width = video.videoWidth; canvas.height = video.videoHeight; };
    } catch (err) {
        try {
            streamObject = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = streamObject;
        } catch(e){}
    }
}

function stopCamera() {
    if (streamObject) {
        streamObject.getTracks().forEach(track => track.stop());
        streamObject = null;
    }
}

// --- ANALYSE ---
scanBtn.addEventListener('click', () => {
    if (!cvReady || !streamObject) return;
    if(navigator.vibrate) navigator.vibrate(30);

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    video.style.display = 'none';
    canvas.style.display = 'block';
    scanBtn.classList.add('hidden');
    stopBtn.classList.add('hidden');

    analyzeImage();
});

function analyzeImage() {
    let src = cv.imread(canvas);
    let hsv = new cv.Mat();
    let maskP1 = new cv.Mat();
    let maskP2 = new cv.Mat();
    let contoursP1 = new cv.MatVector();
    let contoursP2 = new cv.MatVector();

    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        cv.inRange(hsv, new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [90, 80, 50, 0]), new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [130, 255, 255, 255]), maskP1);
        cv.inRange(hsv, new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [5, 100, 100, 0]), new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 255, 255, 255]), maskP2);

        let kernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.morphologyEx(maskP1, maskP1, cv.MORPH_OPEN, kernel);
        cv.morphologyEx(maskP2, maskP2, cv.MORPH_OPEN, kernel);

        cv.findContours(maskP1, contoursP1, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        cv.findContours(maskP2, contoursP2, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        currentResult.p1 = countPieces(contoursP1);
        currentResult.p2 = countPieces(contoursP2);

        showResult();
        
        src.delete(); hsv.delete(); maskP1.delete(); maskP2.delete(); kernel.delete(); contoursP1.delete(); contoursP2.delete();

    } catch(e) { console.error(e); }
}

function countPieces(contours) {
    let count = 0;
    for (let i = 0; i < contours.size(); i++) {
        if (cv.contourArea(contours.get(i)) > 200) count++;
    }
    return count;
}

function showResult() {
    scoreP1.innerText = currentResult.p1;
    scoreP2.innerText = currentResult.p2;
    
    const n1 = p1Input.value || "Blau";
    const n2 = p2Input.value || "Orange";
    
    if (currentResult.p1 > currentResult.p2) winnerMsg.innerText = `${n1} gewinnt`;
    else if (currentResult.p2 > currentResult.p1) winnerMsg.innerText = `${n2} gewinnt`;
    else winnerMsg.innerText = "Unentschieden";

    resultDisplay.classList.remove('hidden');
    saveBtn.disabled = false;
    saveBtn.innerText = "SPEICHERN";
}

retryBtn.addEventListener('click', () => {
    resultDisplay.classList.add('hidden');
    scanBtn.classList.remove('hidden');
    stopBtn.classList.remove('hidden');
    canvas.style.display = 'none';
    video.style.display = 'block';
});

saveBtn.addEventListener('click', () => {
    let history = JSON.parse(localStorage.getItem('nxt_games_v3')) || [];
    history.push({
        date: new Date().toISOString(),
        p1: p1Input.value || "Blau",
        s1: currentResult.p1,
        p2: p2Input.value || "Orange",
        s2: currentResult.p2
    });
    localStorage.setItem('nxt_games_v3', JSON.stringify(history));
    saveBtn.innerText = "GESPEICHERT";
    saveBtn.disabled = true;
});

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_games_v3')) || [];
    historyList.innerHTML = '';
    
    if(history.length === 0) {
        historyList.innerHTML = '<div class="empty-state">Keine Einträge</div>';
        return;
    }

    history.slice().reverse().forEach(g => {
        let win = g.s1 > g.s2;
        let time = new Date(g.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        
        let badgeColor = win ? '#007AFF' : (g.s1==g.s2 ? '#999' : '#FF9500');
        
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div>
                <div style="font-weight:700; color:#333; font-size:0.95rem">
                    ${g.p1}: ${g.s1} - ${g.p2}: ${g.s2}
                </div>
                <div style="font-size:0.75rem; color:#999">${time} Uhr</div>
            </div>
            <div style="width:10px; height:10px; border-radius:50%; background:${badgeColor}"></div>
        `;
        historyList.appendChild(div);
    });
}

deleteBtn.addEventListener('click', () => {
    if(confirm('Verlauf löschen?')) {
        localStorage.removeItem('nxt_games_v3');
        renderHistory();
    }
});

function checkIOS() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIOS && !isStandalone) {
        const p = document.getElementById('ios-install-prompt');
        setTimeout(() => p.classList.remove('hidden'), 2000);
        document.getElementById('close-prompt').onclick = () => p.classList.add('hidden');
    }
}