/**
 * NXT Game Scanner v22.0
 * Hex Board Detection + HSV Blob Sampling
 */

const PIN_GRID = [
    { id: 1, x: -112.5, y: -64.95 }, { id: 2, x: -112.5, y: -21.65 }, { id: 3, x: -112.5, y: 21.65 }, { id: 4, x: -112.5, y: 64.95 },
    { id: 5, x: -75.0, y: -86.60 }, { id: 6, x: -75.0, y: -43.30 }, { id: 7, x: -75.0, y: 0.00 }, { id: 8, x: -75.0, y: 43.30 }, { id: 9, x: -75.0, y: 86.60 },
    { id: 10, x: -37.5, y: -108.25 }, { id: 11, x: -37.5, y: -64.95 }, { id: 12, x: -37.5, y: -21.65 }, { id: 13, x: -37.5, y: 21.65 }, { id: 14, x: -37.5, y: 64.95 }, { id: 15, x: -37.5, y: 108.25 },
    { id: 16, x: 0.0, y: -129.90 }, { id: 17, x: 0.0, y: -86.60 }, { id: 18, x: 0.0, y: -43.30 }, { id: 19, x: 0.0, y: 0.00 }, { id: 20, x: 0.0, y: 43.30 }, { id: 21, x: 0.0, y: 86.60 }, { id: 22, x: 0.0, y: 129.90 },
    { id: 23, x: 37.5, y: -108.25 }, { id: 24, x: 37.5, y: -64.95 }, { id: 25, x: 37.5, y: -21.65 }, { id: 26, x: 37.5, y: 21.65 }, { id: 27, x: 37.5, y: 64.95 }, { id: 28, x: 37.5, y: 108.25 },
    { id: 29, x: 75.0, y: -86.60 }, { id: 30, x: 75.0, y: -43.30 }, { id: 31, x: 75.0, y: 0.00 }, { id: 32, x: 75.0, y: 43.30 }, { id: 33, x: 75.0, y: 86.60 },
    { id: 34, x: 112.5, y: -64.95 }, { id: 35, x: 112.5, y: -21.65 }, { id: 36, x: 112.5, y: 21.65 }, { id: 37, x: 112.5, y: 64.95 }
];

const COLORS = {
    magenta: { name: 'Magenta', hex: '#E91E63', hsvLow: [135, 60, 60], hsvHigh: [175, 255, 255] },
    yellow:  { name: 'Gelb',    hex: '#FFEB3B', hsvLow: [15, 80, 80],  hsvHigh: [40, 255, 255] },
    blue:    { name: 'Blau',    hex: '#2196F3', hsvLow: [95, 80, 60],  hsvHigh: [130, 255, 255] },
    green:   { name: 'Grün',    hex: '#4CAF50', hsvLow: [40, 60, 50],  hsvHigh: [85, 255, 255] }
};

const HISTORY_KEY = 'nxt_games_v22';
const TARGET_SIZE = 400;
const TARGET_RADIUS = 140;
const TARGET_CENTER = TARGET_SIZE / 2;

let players = [
    { name: 'Spieler 1', colorKey: 'magenta', score: 0 },
    { name: 'Spieler 2', colorKey: 'yellow', score: 0 }
];

let cvReady = false;
let stream = null;
let scanInterval = null;
let stabilityCounter = 0;
let lastHomography = null;

const el = {};

function onOpenCvReady() {
    cvReady = true;
    if (el.instructionText) el.instructionText.textContent = 'Bereit - Starte ein Spiel';
}

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initSvgGrid();
    initEventListeners();
    enforceUniqueColors();
    renderPlayers();
    renderHistory();
    checkInstallPrompt();
    registerServiceWorker();
});

function initElements() {
    el.video = document.getElementById('video');
    el.canvas = document.getElementById('canvas');
    el.instructionText = document.getElementById('instruction-text');
    el.gridOverlay = document.querySelector('.hex-grid-overlay');
    el.gridLines = document.getElementById('grid-lines');
    el.pinGroup = document.getElementById('pin-template-group');
    el.scanBtn = document.getElementById('trigger-scan-btn');
    el.homeBtn = document.getElementById('home-btn');
    el.scoreList = document.getElementById('score-list');
    el.controlsSheet = document.getElementById('controls-sheet');
    el.winnerMsg = document.getElementById('winner-msg');
    el.playersContainer = document.getElementById('players-container');
    el.playerCountDisplay = document.getElementById('player-count-display');
    el.sideMenu = document.getElementById('side-menu');
    el.menuOverlay = document.getElementById('side-menu-overlay');
    el.randomResult = document.getElementById('random-result');
    el.installModal = document.getElementById('install-modal');
}

function initSvgGrid() {
    if (!el.pinGroup || !el.gridLines) return;
    el.pinGroup.innerHTML = '';
    el.gridLines.innerHTML = '';

    const connections = buildGridConnections(PIN_GRID);
    connections.forEach(([a, b]) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', a.x);
        line.setAttribute('y1', a.y);
        line.setAttribute('x2', b.x);
        line.setAttribute('y2', b.y);
        line.classList.add('grid-line');
        el.gridLines.appendChild(line);
    });

    PIN_GRID.forEach(pin => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', '4.5');
        circle.setAttribute('cx', pin.x);
        circle.setAttribute('cy', pin.y);
        circle.classList.add('pin-marker');
        circle.id = `pin-${pin.id}`;
        el.pinGroup.appendChild(circle);
    });
}

function buildGridConnections(pins) {
    const edges = [];
    for (let i = 0; i < pins.length; i += 1) {
        for (let j = i + 1; j < pins.length; j += 1) {
            const dx = pins[i].x - pins[j].x;
            const dy = pins[i].y - pins[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dist - 43.3) <= 1.2) {
                edges.push([pins[i], pins[j]]);
            }
        }
    }
    return edges;
}

function initEventListeners() {
    document.getElementById('menu-btn')?.addEventListener('click', toggleMenu);
    el.menuOverlay?.addEventListener('click', closeMenu);
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            closeMenu();
            switchView(btn.dataset.target);
        });
    });

    document.getElementById('start-game-btn')?.addEventListener('click', () => switchView('view-game'));
    el.homeBtn?.addEventListener('click', () => switchView('view-setup'));
    el.scanBtn?.addEventListener('click', triggerScan);
    document.getElementById('next-game-btn')?.addEventListener('click', () => switchView('view-setup'));
    document.getElementById('retry-btn')?.addEventListener('click', retryScan);

    document.getElementById('add-player-btn')?.addEventListener('click', addPlayer);
    document.getElementById('remove-player-btn')?.addEventListener('click', removePlayer);
    document.getElementById('random-start-btn')?.addEventListener('click', pickRandomStarter);

    document.getElementById('delete-btn')?.addEventListener('click', clearHistory);
    document.getElementById('install-dismiss-btn')?.addEventListener('click', () => el.installModal?.classList.add('hidden'));
    document.getElementById('close-install')?.addEventListener('click', () => el.installModal?.classList.add('hidden'));
}

function toggleMenu() { el.sideMenu?.classList.toggle('open'); el.menuOverlay?.classList.toggle('open'); }
function closeMenu() { el.sideMenu?.classList.remove('open'); el.menuOverlay?.classList.remove('open'); }

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById(viewId)?.classList.add('active-view');
    if (el.homeBtn) {
        if (viewId === 'view-setup') el.homeBtn.classList.add('hidden');
        else el.homeBtn.classList.remove('hidden');
    }
    if (viewId === 'view-game') startCamera();
    else { stopCamera(); stopAutoScan(); }
}

function addPlayer() {
    if (players.length >= 4) return;
    const colors = Object.keys(COLORS);
    const used = players.map(p => p.colorKey);
    const free = colors.find(c => !used.includes(c)) || 'blue';
    players.push({ name: `Spieler ${players.length + 1}`, colorKey: free, score: 0 });
    enforceUniqueColors();
    renderPlayers();
}

function removePlayer() {
    if (players.length > 2) {
        players.pop();
        renderPlayers();
    }
}

function renderPlayers() {
    if (!el.playersContainer) return;
    el.playersContainer.innerHTML = players.map((p, idx) => `
        <div class="player-card" style="border-left-color: ${COLORS[p.colorKey].hex}">
            <div class="player-row">
                <input class="player-input" type="text" value="${p.name}" data-idx="${idx}" onchange="updatePlayerName(this)">
            </div>
            <div class="color-picker">
                ${Object.keys(COLORS).map(k => `
                    <button class="color-dot ${p.colorKey === k ? 'active' : ''}" style="background: ${COLORS[k].hex}" onclick="setPlayerColor(${idx}, '${k}')"></button>
                `).join('')}
            </div>
        </div>
    `).join('');
    el.playerCountDisplay.textContent = players.length;
}

window.updatePlayerName = (elm) => { players[elm.dataset.idx].name = elm.value; };
window.setPlayerColor = (idx, key) => {
    if (players[idx].colorKey === key) return;
    const otherIdx = players.findIndex((p, i) => i !== idx && p.colorKey === key);
    if (otherIdx >= 0) {
        const prev = players[idx].colorKey;
        players[idx].colorKey = key;
        players[otherIdx].colorKey = prev;
    } else {
        players[idx].colorKey = key;
    }
    renderPlayers();
};

function enforceUniqueColors() {
    const used = new Set();
    const available = Object.keys(COLORS);
    players.forEach((player) => {
        if (!used.has(player.colorKey)) {
            used.add(player.colorKey);
            return;
        }
        const nextColor = available.find(color => !used.has(color)) || player.colorKey;
        player.colorKey = nextColor;
        used.add(nextColor);
    });
}

function pickRandomStarter() {
    const r = players[Math.floor(Math.random() * players.length)];
    el.randomResult.textContent = `${r.name} startet!`;
    el.randomResult.classList.remove('hidden');
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        el.video.srcObject = stream;
        el.video.onloadedmetadata = () => {
            el.video.play();
            resetGameUI();
            startAutoScan();
        };
    } catch (err) {
        console.error(err);
        setScanReady(false, 'Kamera Fehler');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
}

function startAutoScan() {
    if (scanInterval || !cvReady) return;
    scanInterval = setInterval(detectBoardLoop, 100);
}

function stopAutoScan() {
    clearInterval(scanInterval);
    scanInterval = null;
}

function resetGameUI() {
    el.controlsSheet?.classList.add('hidden');
    el.canvas.style.display = 'none';
    el.video.style.display = 'block';
    setScanReady(false, 'Suche Spielfeld...');
    stabilityCounter = 0;
    lastHomography = null;
}

function setScanReady(ready, message) {
    if (el.instructionText) el.instructionText.textContent = message || '';
    if (el.scanBtn) el.scanBtn.disabled = !ready;
    if (ready) el.scanBtn?.classList.add('active'); else el.scanBtn?.classList.remove('active');
    if (ready) el.gridOverlay?.classList.add('ready'); else el.gridOverlay?.classList.remove('ready');
}

function detectBoardLoop() {
    if (!el.video.videoWidth || !cvReady) return;
    const w = 360;
    const h = Math.round(w * (el.video.videoHeight / el.video.videoWidth));
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext('2d').drawImage(el.video, 0, 0, w, h);

    let src = cv.imread(tempCanvas);
    let gray = new cv.Mat();
    let blur = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
        cv.Canny(blur, edges, 60, 150);
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let best = null;
        let bestArea = 0;

        for (let i = 0; i < contours.size(); i += 1) {
            const cnt = contours.get(i);
            const area = cv.contourArea(cnt);
            if (area > bestArea) {
                bestArea = area;
                best = cnt;
            }
        }

        if (!best || bestArea < w * h * 0.15) {
            handleUnstable();
            return;
        }

        const peri = cv.arcLength(best, true);
        let approx = new cv.Mat();
        let found = null;
        for (let eps = 0.01; eps <= 0.06; eps += 0.01) {
            cv.approxPolyDP(best, approx, peri * eps, true);
            if (approx.rows === 6) {
                found = approx.clone();
                break;
            }
        }
        approx.delete();

        if (!found) {
            handleUnstable();
            return;
        }

        const points = [];
        for (let i = 0; i < found.rows; i += 1) {
            const x = found.intPtr(i, 0)[0];
            const y = found.intPtr(i, 0)[1];
            points.push({ x: x * (el.video.videoWidth / w), y: y * (el.video.videoHeight / h) });
        }
        found.delete();

        const ordered = orderHexPoints(points);
        if (!ordered) {
            handleUnstable();
            return;
        }

        const srcTri = cv.matFromArray(6, 1, cv.CV_32FC2, ordered.flatMap(p => [p.x, p.y]));
        const dstPoints = getCanonicalHexPoints();
        const dstTri = cv.matFromArray(6, 1, cv.CV_32FC2, dstPoints.flatMap(p => [p.x, p.y]));
        const H = cv.getPerspectiveTransform(srcTri, dstTri);
        srcTri.delete(); dstTri.delete();

        lastHomography = H;
        stabilityCounter++;
        if (stabilityCounter > 5) {
            setScanReady(true, 'Bereit - drücke SCAN');
        } else {
            setScanReady(false, 'Ausrichten...');
        }
    } catch (e) {
        console.error(e);
        handleUnstable();
    } finally {
        src.delete(); gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
    }
}

function handleUnstable() {
    stabilityCounter = Math.max(0, stabilityCounter - 2);
    if (stabilityCounter === 0) {
        setScanReady(false, 'Suche Spielfeld...');
    }
}

function orderHexPoints(points) {
    if (points.length !== 6) return null;
    const cx = points.reduce((sum, p) => sum + p.x, 0) / 6;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / 6;
    const sorted = points.map(p => ({ ...p, ang: Math.atan2(p.y - cy, p.x - cx) }))
        .sort((a, b) => a.ang - b.ang);
    let idxTop = 0;
    for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i].y < sorted[idxTop].y) idxTop = i;
    }
    const rotated = [];
    for (let i = 0; i < sorted.length; i += 1) {
        rotated.push(sorted[(idxTop + i) % sorted.length]);
    }
    const signed = polygonSignedArea(rotated);
    if (signed > 0) rotated.reverse();
    return rotated.map(({ x, y }) => ({ x, y }));
}

function polygonSignedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
        const next = points[(i + 1) % points.length];
        area += points[i].x * next.y - next.x * points[i].y;
    }
    return area / 2;
}

function getCanonicalHexPoints() {
    const pts = [
        { x: 0, y: -TARGET_RADIUS },
        { x: 121.24, y: -70 },
        { x: 121.24, y: 70 },
        { x: 0, y: TARGET_RADIUS },
        { x: -121.24, y: 70 },
        { x: -121.24, y: -70 }
    ];
    return pts.map(p => ({ x: TARGET_CENTER + p.x, y: TARGET_CENTER + p.y }));
}

function triggerScan() {
    if (!lastHomography || el.scanBtn.disabled) return;
    stopAutoScan();
    el.instructionText.textContent = 'Analysiere...';

    el.canvas.width = el.video.videoWidth;
    el.canvas.height = el.video.videoHeight;
    el.canvas.getContext('2d').drawImage(el.video, 0, 0);
    el.video.style.display = 'none';
    el.canvas.style.display = 'block';

    setTimeout(analyzeImage, 30);
}

function analyzeImage() {
    if (!lastHomography) return;

    let src = cv.imread(el.canvas);
    let warped = new cv.Mat();
    let hsv = new cv.Mat();

    try {
        const dsize = new cv.Size(TARGET_SIZE, TARGET_SIZE);
        cv.warpPerspective(src, warped, lastHomography, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
        cv.cvtColor(warped, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

        const colorMasks = {};
        Object.keys(COLORS).forEach(key => {
            colorMasks[key] = buildColorMask(hsv, COLORS[key]);
            const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.morphologyEx(colorMasks[key], colorMasks[key], cv.MORPH_OPEN, kernel);
            kernel.delete();
        });

        const counts = Object.keys(COLORS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
        PIN_GRID.forEach(pin => {
            const px = Math.round(TARGET_CENTER + pin.x);
            const py = Math.round(TARGET_CENTER + pin.y);
            const result = findBestColorAt(px, py, colorMasks);
            if (result) counts[result] += 1;
        });

        players.forEach(p => {
            p.score = counts[p.colorKey] || 0;
        });

        Object.values(colorMasks).forEach(mat => mat.delete());
        showResults();
    } catch (e) {
        console.error(e);
        alert('Fehler bei Analyse');
    } finally {
        src.delete(); warped.delete(); hsv.delete();
    }
}

function buildColorMask(hsv, cDef) {
    const [h1, s1, v1] = cDef.hsvLow;
    const [h2, s2, v2] = cDef.hsvHigh;
    let mask = new cv.Mat();

    if (h1 <= h2) {
        const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h1, s1, v1, 0]);
        const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h2, s2, v2, 255]);
        cv.inRange(hsv, low, high, mask);
        low.delete(); high.delete();
        return mask;
    }

    const low1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, s1, v1, 0]);
    const high1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h2, s2, v2, 255]);
    const low2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [h1, s1, v1, 0]);
    const high2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, s2, v2, 255]);
    const mask1 = new cv.Mat();
    const mask2 = new cv.Mat();
    cv.inRange(hsv, low1, high1, mask1);
    cv.inRange(hsv, low2, high2, mask2);
    cv.bitwise_or(mask1, mask2, mask);
    low1.delete(); high1.delete(); low2.delete(); high2.delete(); mask1.delete(); mask2.delete();
    return mask;
}

function findBestColorAt(x, y, masks) {
    const radius = 6;
    let bestKey = null;
    let bestRatio = 0;
    Object.keys(masks).forEach(key => {
        const mask = masks[key];
        let hits = 0;
        let total = 0;
        for (let dy = -radius; dy <= radius; dy += 2) {
            for (let dx = -radius; dx <= radius; dx += 2) {
                const px = x + dx;
                const py = y + dy;
                if (px < 0 || py < 0 || px >= mask.cols || py >= mask.rows) continue;
                if (mask.ucharPtr(py, px)[0] === 255) hits++;
                total++;
            }
        }
        if (total > 0) {
            const ratio = hits / total;
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestKey = key;
            }
        }
    });
    return bestRatio >= 0.25 ? bestKey : null;
}

function showResults() {
    el.controlsSheet?.classList.remove('hidden');
    const ranked = [...players].sort((a, b) => b.score - a.score);
    const winner = ranked[0];

    if (winner.score > 0) {
        el.winnerMsg.textContent = `🏆 ${winner.name} gewinnt!`;
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    } else {
        el.winnerMsg.textContent = 'Keine Steine erkannt';
    }

    el.scoreList.innerHTML = ranked.map((p, i) => `
        <div class="rank-card ${i === 0 && p.score > 0 ? 'rank-1' : ''}">
            <div class="rank-info">
                <span class="rank-pos">${i + 1}</span>
                <span class="rank-name">${p.name}</span>
                <div class="rank-dot" style="background:${COLORS[p.colorKey].hex}"></div>
            </div>
            <span class="rank-score">${p.score}</span>
        </div>
    `).join('');

    let hist = loadHistory();
    hist.push({
        date: new Date().toISOString(),
        winner: winner.score > 0 ? winner.name : '-',
        topScore: winner.score,
        details: players.map(p => `${p.name}:${p.score}`).join(', ')
    });
    if (hist.length > 50) hist = hist.slice(-50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
}

function retryScan() {
    el.controlsSheet?.classList.add('hidden');
    resetGameUI();
    startAutoScan();
}

function clearHistory() {
    if (confirm('Löschen?')) {
        localStorage.removeItem(HISTORY_KEY);
        renderHistory();
    }
}

function loadHistory() {
    let hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (hist.length === 0) {
        const legacy = JSON.parse(localStorage.getItem('nxt_games_v21') || '[]');
        if (legacy.length > 0) {
            hist = legacy;
            localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
        }
    }
    return hist;
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    const hist = loadHistory();

    if (hist.length === 0) {
        list.innerHTML = '<div class="empty-state">Keine Daten</div>';
        renderStats([]);
        return;
    }

    list.innerHTML = hist.slice().reverse().map(h => {
        const d = new Date(h.date).toLocaleDateString();
        return `
            <div class="history-item">
                <div>
                    <div class="hist-winner">🏆 ${h.winner} (${h.topScore})</div>
                    <div style="font-size:0.8rem;color:#6f8b8d">${h.details}</div>
                </div>
                <div style="font-size:0.8rem;color:#6f8b8d">${d}</div>
            </div>
        `;
    }).join('');

    renderStats(hist);
}

function renderStats(hist) {
    const stats = document.getElementById('stats-content');
    if (!stats) return;

    if (!hist.length) {
        stats.innerHTML = '<p class="empty-state">Noch keine Spieldaten</p>';
        return;
    }

    const wins = {};
    hist.forEach(h => { wins[h.winner] = (wins[h.winner] || 0) + 1; });
    const entries = Object.entries(wins).filter(([name]) => name !== '-');
    entries.sort((a, b) => b[1] - a[1]);

    stats.innerHTML = `
        <p><strong>Spiele:</strong> ${hist.length}</p>
        <p><strong>Top Gewinner:</strong> ${entries[0] ? `${entries[0][0]} (${entries[0][1]})` : '—'}</p>
    `;
}

function checkInstallPrompt() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isAndroid = /Android/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone || !el.installModal) return;

    const show = (msg) => {
        document.getElementById('install-instructions').innerHTML = msg;
        setTimeout(() => el.installModal.classList.remove('hidden'), 2000);
    };

    if (isIOS) show(`1. Tippe auf <span class="step-icon icon-ios-share"></span><br>2. "Zum Home-Bildschirm"`);
    else if (isAndroid) show(`1. Tippe auf Menü<br>2. "App installieren"`);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW failed', err));
    }
}
