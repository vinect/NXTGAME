// Globale Elemente
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const scanBtn = document.getElementById('scan-btn');
const resultDisplay = document.getElementById('result-display');
const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');
const winnerMsg = document.getElementById('winner-msg');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');

// Menu Elemente
const menuBtn = document.getElementById('menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('menu-overlay');
const historyList = document.getElementById('history-list');
const clearDataBtn = document.getElementById('clear-data-btn');

let cvReady = false;
let currentResult = { p1: 0, p2: 0 };

// OpenCV Start
function onOpenCvReady() {
    console.log("NXT Engine geladen.");
    cvReady = true;
}

// 1. KAMERA
async function initCamera() {
    const constraints = { video: { facingMode: { exact: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        handleStream(stream);
    } catch (err) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
            handleStream(stream);
        } catch (e) {
            console.warn("Kamerafehler", e);
        }
    }
}

function handleStream(stream) {
    video.srcObject = stream;
    video.onloadedmetadata = () => { video.play(); canvas.width = video.videoWidth; canvas.height = video.videoHeight; };
}

// 2. ANALYSE LOGIK
function processImage() {
    if (!cvReady) return;
    
    // Canvas füllen
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Video ausblenden, Canvas zeigen (Freeze Effect)
    video.style.display = 'none';
    canvas.style.display = 'block';

    // OpenCV init
    let src = cv.imread(canvas);
    let blurred = new cv.Mat();
    let hsv = new cv.Mat();
    let maskWhite = new cv.Mat();
    let contoursBands = new cv.MatVector();
    let hierarchy = new cv.Mat();
    let maskP1 = new cv.Mat();
    let maskP2 = new cv.Mat();
    let contoursP1 = new cv.MatVector();
    let contoursP2 = new cv.MatVector();

    try {
        let kSize = new cv.Size(5, 5);
        cv.GaussianBlur(src, blurred, kSize, 0, 0, cv.BORDER_DEFAULT);
        cv.cvtColor(blurred, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        // A) Gummibänder (Dreiecke) finden
        let lowWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, 140, 0]);
        let highWhite = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 60, 255, 255]);
        cv.inRange(hsv, lowWhite, highWhite, maskWhite);
        let kernel = cv.Mat.ones(5, 5, cv.CV_8U);
        cv.dilate(maskWhite, maskWhite, kernel);
        cv.findContours(maskWhite, contoursBands, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

        let triangles = [];
        for (let i = 0; i < contoursBands.size(); i++) {
            // Check Parent Index (-1 means hole if using RETR_CCOMP) und Größe
            if (hierarchy.intPtr(0, i)[3] != -1 && cv.contourArea(contoursBands.get(i)) > 500) {
                triangles.push(contoursBands.get(i));
            }
        }

        // B) Figuren finden
        let lowP1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [90, 80, 50, 0]);
        let highP1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [130, 255, 255, 255]);
        cv.inRange(hsv, lowP1, highP1, maskP1);

        let lowP2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [5, 100, 100, 0]);
        let highP2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [35, 255, 255, 255]);
        cv.inRange(hsv, lowP2, highP2, maskP2);

        cv.morphologyEx(maskP1, maskP1, cv.MORPH_OPEN, kernel);
        cv.morphologyEx(maskP2, maskP2, cv.MORPH_OPEN, kernel);

        cv.findContours(maskP1, contoursP1, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        cv.findContours(maskP2, contoursP2, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // Zählen
        currentResult.p1 = countIfEnclosed(contoursP1, triangles); 
        currentResult.p2 = countIfEnclosed(contoursP2, triangles); 

        showResult();

        // Cleanup
        lowWhite.delete(); highWhite.delete(); lowP1.delete(); highP1.delete(); lowP2.delete(); highP2.delete();
        kernel.delete(); hierarchy.delete();

    } catch (e) { console.error(e); }
    finally {
        src.delete(); blurred.delete(); hsv.delete(); maskWhite.delete(); contoursBands.delete();
        maskP1.delete(); maskP2.delete(); contoursP1.delete(); contoursP2.delete();
    }
}

function countIfEnclosed(contours, triangles) {
    let count = 0;
    for (let i = 0; i < contours.size(); i++) {
        let cnt = contours.get(i);
        if (cv.contourArea(cnt) > 200) {
            let M = cv.moments(cnt);
            let cx = M.m10 / M.m00;
            let cy = M.m01 / M.m00;
            let pt = new cv.Point(cx, cy);
            for(let t of triangles) {
                if(cv.pointPolygonTest(t, pt, false) > 0) { count++; break; }
            }
        }
    }
    return count;
}

// 3. UI UPDATES
function showResult() {
    scoreP1.innerText = currentResult.p1;
    scoreP2.innerText = currentResult.p2;
    winnerMsg.innerText = currentResult.p1 > currentResult.p2 ? "Blau gewinnt!" : (currentResult.p2 > currentResult.p1 ? "Orange gewinnt!" : "Unentschieden");
    
    scanBtn.classList.add('hidden');
    resultDisplay.classList.remove('hidden');
    saveBtn.disabled = false;
    saveBtn.innerText = "Speichern";
}

function saveGame() {
    let history = JSON.parse(localStorage.getItem('nxt_game_history')) || [];
    history.push({ date: new Date().toISOString(), p1: currentResult.p1, p2: currentResult.p2 });
    localStorage.setItem('nxt_game_history', JSON.stringify(history));
    saveBtn.innerText = "Gespeichert";
    saveBtn.disabled = true;
    renderHistory();
}

function resetApp() {
    resultDisplay.classList.add('hidden');
    scanBtn.classList.remove('hidden');
    canvas.style.display = 'none';
    video.style.display = 'block';
    scoreP1.innerText = "-";
    scoreP2.innerText = "-";
}

// 4. MENU & HISTORIE
function openMenu() { sideMenu.classList.add('active'); menuOverlay.classList.add('active'); renderHistory(); }
function closeMenu() { sideMenu.classList.remove('active'); menuOverlay.classList.remove('active'); }

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('nxt_game_history')) || [];
    let stats = { total: history.length, p1: 0, p2: 0 };
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">Keine Einträge</div>';
    } else {
        history.slice().reverse().forEach(game => {
            if (game.p1 > game.p2) stats.p1++;
            else if (game.p2 > game.p1) stats.p2++;
            
            const dateStr = new Date(game.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour:'2-digit', minute:'2-digit'});
            let dotClass = game.p1 > game.p2 ? 'dot-p1' : (game.p2 > game.p1 ? 'dot-p2' : '');
            
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<div><span class="winner-dot ${dotClass}"></span> ${game.p1} : ${game.p2}</div><div style="color:#8E8E93; font-size:0.8rem;">${dateStr}</div>`;
            historyList.appendChild(item);
        });
    }
    document.getElementById('menu-total').innerText = stats.total;
    document.getElementById('menu-p1').innerText = stats.p1;
    document.getElementById('menu-p2').innerText = stats.p2;
}

function clearData() {
    if(confirm("Historie löschen?")) {
        localStorage.removeItem('nxt_game_history');
        renderHistory();
    }
}

// 5. iOS DETECTION
function checkIOS() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
        const prompt = document.getElementById('ios-install-prompt');
        setTimeout(() => prompt.classList.remove('hidden'), 2000);
        document.getElementById('close-prompt').addEventListener('click', () => prompt.classList.add('hidden'));
    }
}

// EVENTS
window.addEventListener('load', () => { initCamera(); renderHistory(); checkIOS(); });
scanBtn.addEventListener('click', processImage);
resetBtn.addEventListener('click', resetApp);
saveBtn.addEventListener('click', saveGame);
menuBtn.addEventListener('click', openMenu);
closeMenuBtn.addEventListener('click', closeMenu);
menuOverlay.addEventListener('click', closeMenu);
clearDataBtn.addEventListener('click', clearData);