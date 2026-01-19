/**
 * NXT Game Scanner v22.2
 * Manual scan: average color in triangle centers
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
    green:   { name: 'Gr\u00fcn',    hex: '#4CAF50', hsvLow: [40, 60, 50],  hsvHigh: [85, 255, 255] }
};

const HISTORY_KEY = 'nxt_games_v22';
const HISTORY_CLEAR_KEY = 'nxt_games_cleared_v22';
const VIEWBOX_SIZE = 300;
const VIEWBOX_HALF = VIEWBOX_SIZE / 2;
const SAMPLE_RADIUS_MM = 5; // ~1cm Durchmesser
const SAT_MIN = 45;
const VAL_MIN = 45;
const TRIANGLE_CENTERS = buildTriangleCenters(PIN_GRID);
const HEX_POINTS = [
    [0.5, 0.033333],
    [0.904133, 0.266667],
    [0.904133, 0.733333],
    [0.5, 0.966667],
    [0.095867, 0.733333],
    [0.095867, 0.266667],
];
const DETECTION = {
    cannyLow: 40,
    cannyHigh: 120,
    blurSize: 5,
    approxEpsilon: 0.02,
    minAreaRatio: 0.125,
};
const ALIGN_SAMPLE_INTERVAL = 160;
let players = [
    { name: 'Spieler 1', colorKey: 'magenta', score: 0 },
    { name: 'Spieler 2', colorKey: 'yellow', score: 0 }
];

let stream = null;
let diceRolling = false;
let dicePos = { x: 0, y: 0 };
let diceDrag = null;
let diceSettleTimer = null;
let historyRangeDays = 'all';
let cvReady = false;
let alignmentActive = false;
let alignmentLayout = null;
let alignmentLoopId = null;
let lastAlignmentSample = 0;
let scanInProgress = false;
let hexMaskCache = null;

const el = {};
const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
const staticCanvas = document.createElement('canvas');
const staticCtx = staticCanvas.getContext('2d', { willReadFrequently: true });
const cvInputCanvas = document.createElement('canvas');
const cvInputCtx = cvInputCanvas.getContext('2d', { willReadFrequently: true });

document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initSvgGrid();
    initEventListeners();
    initDice();
    enforceUniqueColors();
    renderPlayers();
    renderHistory();
    checkInstallPrompt();
    registerServiceWorker();
    initOpenCv();
    buildAlignmentLayout();
    window.addEventListener('resize', buildAlignmentLayout);
    window.addEventListener('orientationchange', buildAlignmentLayout);
});

function initElements() {
    el.video = document.getElementById('video');
    el.canvas = document.getElementById('canvas');
    el.instructionText = document.getElementById('instruction-text');
    el.gridOverlay = document.querySelector('.hex-grid-overlay');
    el.overlaySvg = document.querySelector('.hex-grid-overlay');
    el.overlayCanvas = document.getElementById('overlay-canvas');
    el.cameraWrapper = document.querySelector('.camera-wrapper');
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
    el.dice = document.getElementById('dice');
    el.diceLane = document.getElementById('dice-lane');
    el.diceMover = document.getElementById('dice-mover');
    el.rollDiceBtn = document.getElementById('roll-dice-btn');
    el.shareQr = document.getElementById('share-qr');
    el.historyFilters = document.querySelectorAll('.history-chip');
    el.statsTotal = document.getElementById('stats-total');
    el.statsTop = document.getElementById('stats-top');
    el.statsAvg = document.getElementById('stats-avg');
    el.statsLast = document.getElementById('stats-last');
    el.statsLeaderboard = document.getElementById('stats-leaderboard');
    el.statsStreak = document.getElementById('stats-streak');
    el.interestConsent = document.getElementById('interest-consent');
    el.interestSubmit = document.getElementById('interest-submit');
}

function initOpenCv() {
    waitForOpenCv().then((ready) => {
        cvReady = ready;
        if (!cvReady) {
            if (!scanInProgress) setScanReady(true, 'OpenCV nicht verf\u00fcgbar');
            return;
        }
        updateScanReadyState();
    });
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
    document.getElementById('roll-dice-btn')?.addEventListener('click', rollDice);
    el.dice?.addEventListener('pointerdown', onDicePointerDown);
    window.addEventListener('pointermove', onDicePointerMove);
    window.addEventListener('pointerup', onDicePointerUp);
    window.addEventListener('pointercancel', onDicePointerUp);
    el.shareQr?.addEventListener('click', shareApp);
    el.shareQr?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            shareApp();
        }
    });
    el.historyFilters?.forEach(btn => {
        btn.addEventListener('click', () => {
            historyRangeDays = btn.dataset.range || 'all';
            el.historyFilters.forEach(b => b.classList.toggle('active', b === btn));
            renderHistory();
        });
    });
    el.interestConsent?.addEventListener('change', updateInterestSubmitState);
    updateInterestSubmitState();
}

function toggleMenu() { el.sideMenu?.classList.toggle('open'); el.menuOverlay?.classList.toggle('open'); }
function closeMenu() { el.sideMenu?.classList.remove('open'); el.menuOverlay?.classList.remove('open'); }

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById(viewId)?.classList.add('active-view');
    document.querySelectorAll('.menu-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === viewId);
    });
    if (el.homeBtn) {
        if (viewId === 'view-setup') el.homeBtn.classList.add('hidden');
        else el.homeBtn.classList.remove('hidden');
    }
    if (viewId === 'view-game') {
        requestAnimationFrame(() => startCamera());
    }
    else stopCamera();
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

function updateInterestSubmitState() {
    if (!el.interestSubmit || !el.interestConsent) return;
    el.interestSubmit.disabled = !el.interestConsent.checked;
}

function shareApp() {
    if (navigator.share) {
        navigator.share({
            title: 'NXT Game',
            text: 'NXT Game App',
            url: window.location.href
        }).catch(() => {});
        return;
    }
    alert('Teilen wird auf diesem Gerät nicht unterstützt.');
}

function initDice() {
    if (!el.dice) return;
    setDiceValue(1);
}

function setDiceValue(value) {
    if (!el.dice) return;
    el.dice.classList.remove('value-1', 'value-2', 'value-3', 'value-4', 'value-5', 'value-6');
    el.dice.classList.add(`value-${value}`);
}

function setDiceOffset(x, y) {
    dicePos = { x, y };
    if (!el.diceMover) return;
    el.diceMover.style.setProperty('--dice-x', `${x}px`);
    el.diceMover.style.setProperty('--dice-y', `${y}px`);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getDiceLimits() {
    if (!el.diceLane || !el.dice) return null;
    const lane = el.diceLane.getBoundingClientRect();
    const diceRect = el.dice.getBoundingClientRect();
    if (!lane.width || !lane.height || !diceRect.width || !diceRect.height) return null;
    const maxX = Math.max(0, (lane.width - diceRect.width) / 2);
    const maxY = Math.max(0, (lane.height - diceRect.height) / 2);
    return { minX: -maxX, maxX, minY: -maxY, maxY };
}

function beginDiceRoll() {
    if (!el.dice) return;
    diceRolling = true;
    if (el.rollDiceBtn) el.rollDiceBtn.disabled = true;
    el.dice.classList.add('rolling');
}

function finishDiceRoll() {
    const finalValue = Math.floor(Math.random() * 6) + 1;
    setDiceValue(finalValue);
    if (el.dice) el.dice.classList.remove('rolling');
    if (el.rollDiceBtn) el.rollDiceBtn.disabled = false;
    diceRolling = false;
}

function rollDice() {
    if (!el.dice || diceRolling) return;
    beginDiceRoll();

    setTimeout(() => {
        finishDiceRoll();
    }, 1000);
}

function onDicePointerDown(event) {
    if (!el.dice || !el.diceMover || diceRolling) return;
    const limits = getDiceLimits();
    if (!limits) return;
    beginDiceRoll();
    el.diceMover.classList.add('dragging');
    el.dice.setPointerCapture(event.pointerId);
    diceDrag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: dicePos.x,
        baseY: dicePos.y,
        lastX: event.clientX,
        lastY: event.clientY,
        lastT: performance.now(),
        vx: 0,
        vy: 0,
    };
}

function onDicePointerMove(event) {
    if (!diceDrag || event.pointerId !== diceDrag.id) return;
    const limits = getDiceLimits();
    if (!limits) return;
    const dx = event.clientX - diceDrag.startX;
    const dy = event.clientY - diceDrag.startY;
    const nextX = clamp(diceDrag.baseX + dx, limits.minX, limits.maxX);
    const nextY = clamp(diceDrag.baseY + dy, limits.minY, limits.maxY);
    setDiceOffset(nextX, nextY);

    const now = performance.now();
    const dt = Math.max(16, now - diceDrag.lastT);
    diceDrag.vx = (event.clientX - diceDrag.lastX) / dt;
    diceDrag.vy = (event.clientY - diceDrag.lastY) / dt;
    diceDrag.lastX = event.clientX;
    diceDrag.lastY = event.clientY;
    diceDrag.lastT = now;
    event.preventDefault();
}

function onDicePointerUp(event) {
    if (!diceDrag || event.pointerId !== diceDrag.id) return;
    if (el.dice) el.dice.releasePointerCapture(event.pointerId);
    if (el.diceMover) el.diceMover.classList.remove('dragging');
    const limits = getDiceLimits();
    if (limits) {
        const fling = 240;
        const targetX = clamp(dicePos.x + diceDrag.vx * fling, limits.minX, limits.maxX);
        const targetY = clamp(dicePos.y + diceDrag.vy * fling, limits.minY, limits.maxY);
        setDiceOffset(targetX, targetY);
    }
    clearTimeout(diceSettleTimer);
    diceSettleTimer = setTimeout(() => {
        finishDiceRoll();
    }, 450);
    diceDrag = null;
}

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        const track = stream.getVideoTracks()[0];
        if (track) {
            await configureCamera(track);
        }
        el.video.srcObject = stream;
        el.video.onloadedmetadata = () => {
            el.video.play();
            resetGameUI();
            buildAlignmentLayout();
            startAlignmentLoop();
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
    stopAlignmentLoop();
}

function resetGameUI() {
    el.controlsSheet?.classList.add('hidden');
    el.canvas.style.display = 'none';
    el.video.style.display = 'block';
    updateScanReadyState();
}

function setScanReady(ready, message) {
    if (el.instructionText) el.instructionText.textContent = message || '';
    if (el.scanBtn) el.scanBtn.disabled = !ready;
    if (ready) el.scanBtn?.classList.add('active'); else el.scanBtn?.classList.remove('active');
    if (ready) el.gridOverlay?.classList.add('ready'); else el.gridOverlay?.classList.remove('ready');
}

function triggerScan() {
    if (el.scanBtn.disabled) return;
    if (!el.overlaySvg || !el.cameraWrapper) {
        initElements();
        if (!el.overlaySvg || !el.cameraWrapper) {
            setScanReady(true, 'Ansicht nicht bereit');
            return;
        }
    }
    if (!el.video.videoWidth || !el.video.videoHeight) {
        setScanReady(true, 'Kamera nicht bereit');
        return;
    }
    scanInProgress = true;
    el.instructionText.textContent = 'Analysiere...';

    try {
        const counts = Object.keys(COLORS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
        let usedAlignment = false;
        let usedBlobCounts = false;
        if (cvReady) {
            alignmentActive = detectAndWarpHex();
            updateScanReadyState();
            if (alignmentActive) {
                usedAlignment = scanWithAlignedSample(counts);
                const blobCounts = detectBlobCountsFromAligned();
                if (blobCounts) {
                    applyBlobCounts(blobCounts, counts);
                    usedBlobCounts = true;
                }
            }
        }
        if (!usedAlignment) {
            scanWithStaticOverlay(counts);
        }

        players.forEach(p => {
            p.score = counts[p.colorKey] || 0;
        });

        showResults();
    } catch (err) {
        console.error('Scan failed', err);
        setScanReady(true, 'Analyse fehlgeschlagen');
        return;
    } finally {
        el.video.style.display = 'block';
        el.canvas.style.display = 'none';
        scanInProgress = false;
    }

    updateScanReadyState();
}

function getViewBoxMetrics() {
    if (!el.overlaySvg) return null;
    const rect = el.overlaySvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const scale = Math.min(rect.width, rect.height) / VIEWBOX_SIZE;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    return { rect, scale, centerX, centerY };
}

function mapCenterToCanvas(center, view, dpr) {
    const x = view.centerX + center.x * view.scale;
    const y = view.centerY + center.y * view.scale;
    if (x < 0 || y < 0 || x > view.rect.width || y > view.rect.height) return null;
    return { x: x * dpr, y: y * dpr };
}

function drawVideoCover(ctx, video, width, height) {
    if (!video.videoWidth || !video.videoHeight) return;
    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const drawW = video.videoWidth * scale;
    const drawH = video.videoHeight * scale;
    const dx = (width - drawW) / 2;
    const dy = (height - drawH) / 2;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(video, dx, dy, drawW, drawH);
}

function scanWithStaticOverlay(counts) {
    const view = getViewBoxMetrics();
    if (!view) return;
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = Math.max(1, Math.round(view.rect.width * dpr));
    const canvasHeight = Math.max(1, Math.round(view.rect.height * dpr));
    staticCanvas.width = canvasWidth;
    staticCanvas.height = canvasHeight;
    staticCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawVideoCover(staticCtx, el.video, view.rect.width, view.rect.height);
    const frame = staticCtx.getImageData(0, 0, staticCanvas.width, staticCanvas.height);
    const gains = computeWhiteBalanceGains(frame.data);

    const radius = Math.max(2, Math.round(SAMPLE_RADIUS_MM * view.scale * dpr));
    TRIANGLE_CENTERS.forEach(center => {
        const pos = mapCenterToCanvas(center, view, dpr);
        if (!pos) return;
        const avg = averageCircleColor(frame.data, staticCanvas.width, staticCanvas.height, pos.x, pos.y, radius, gains);
        const colorKey = classifyColor(avg);
        if (colorKey) counts[colorKey] += 1;
    });
}

function scanWithAlignedSample(counts) {
    if (!sampleCanvas.width || !sampleCanvas.height) return false;
    const frame = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const gains = computeWhiteBalanceGains(frame.data);
    const scale = sampleCanvas.width / VIEWBOX_SIZE;
    const radius = Math.max(2, Math.round(SAMPLE_RADIUS_MM * scale));
    TRIANGLE_CENTERS.forEach(center => {
        const pos = mapViewBoxToSample(center);
        if (!pos) return;
        const avg = averageCircleColor(frame.data, sampleCanvas.width, sampleCanvas.height, pos.x, pos.y, radius, gains);
        const colorKey = classifyColor(avg);
        if (colorKey) counts[colorKey] += 1;
    });
    return true;
}

function detectBlobCountsFromAligned() {
    if (!cvReady || !alignmentActive || !sampleCanvas.width) return null;
    const src = cv.imread(sampleCanvas);
    const hsv = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
    const counts = {};
    let total = 0;

    try {
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2HSV);
        const maskHex = getHexMask(sampleCanvas.width, sampleCanvas.height);
        const { minArea, maxArea } = getBlobAreaRange(sampleCanvas.width);

        Object.keys(COLORS).forEach((key) => {
            const colorMask = new cv.Mat();
            const masked = new cv.Mat();
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            const [h1, s1, v1] = COLORS[key].hsvLow;
            const [h2, s2, v2] = COLORS[key].hsvHigh;

            try {
                cv.inRange(
                    hsv,
                    new cv.Scalar(h1, s1, v1, 0),
                    new cv.Scalar(h2, s2, v2, 255),
                    colorMask
                );
                cv.bitwise_and(colorMask, maskHex, masked);
                cv.morphologyEx(masked, masked, cv.MORPH_OPEN, kernel);
                cv.morphologyEx(masked, masked, cv.MORPH_CLOSE, kernel);
                cv.findContours(
                    masked,
                    contours,
                    hierarchy,
                    cv.RETR_EXTERNAL,
                    cv.CHAIN_APPROX_SIMPLE
                );

                let count = 0;
                for (let i = 0; i < contours.size(); i += 1) {
                    const contour = contours.get(i);
                    const area = cv.contourArea(contour);
                    if (area >= minArea && area <= maxArea) {
                        count += 1;
                    }
                    contour.delete();
                }
                counts[key] = count;
                total += count;
            } finally {
                colorMask.delete();
                masked.delete();
                contours.delete();
                hierarchy.delete();
            }
        });
    } finally {
        src.delete();
        hsv.delete();
        kernel.delete();
    }

    if (total < 1 || total > TRIANGLE_CENTERS.length) return null;
    return counts;
}

function applyBlobCounts(blobCounts, counts) {
    if (!blobCounts) return;
    Object.keys(COLORS).forEach((key) => {
        if (Number.isFinite(blobCounts[key])) {
            counts[key] = blobCounts[key];
        }
    });
}

function averageCircleColor(data, width, height, cx, cy, radius, gains) {
    const gainR = gains?.r ?? 1;
    const gainG = gains?.g ?? 1;
    const gainB = gains?.b ?? 1;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > r2) continue;
            const x = Math.round(cx + dx);
            const y = Math.round(cy + dy);
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const idx = (y * width + x) * 4;
            sumR += data[idx] * gainR;
            sumG += data[idx + 1] * gainG;
            sumB += data[idx + 2] * gainB;
            count += 1;
        }
    }
    if (!count) return { r: 0, g: 0, b: 0 };
    return {
        r: clampChannel(sumR / count),
        g: clampChannel(sumG / count),
        b: clampChannel(sumB / count),
    };
}

function clampChannel(value) {
    return Math.min(255, Math.max(0, Math.round(value)));
}

function computeWhiteBalanceGains(data) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    const stride = 16;
    for (let i = 0; i < data.length; i += stride) {
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
        count += 1;
    }
    if (!count) return { r: 1, g: 1, b: 1 };
    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;
    const gray = (avgR + avgG + avgB) / 3;
    const clampGain = (value) => Math.min(1.4, Math.max(0.6, value));
    return {
        r: clampGain(gray / (avgR || 1)),
        g: clampGain(gray / (avgG || 1)),
        b: clampGain(gray / (avgB || 1)),
    };
}

function getHexMask(width, height) {
    if (hexMaskCache && hexMaskCache.width === width && hexMaskCache.height === height) {
        return hexMaskCache.mask;
    }
    if (hexMaskCache?.mask) {
        hexMaskCache.mask.delete();
    }

    const mask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    const points = HEX_POINTS.flatMap(([x, y]) => [
        Math.round(x * width),
        Math.round(y * height),
    ]);
    const pts = cv.matFromArray(HEX_POINTS.length, 1, cv.CV_32SC2, points);
    const ptsVec = new cv.MatVector();
    ptsVec.push_back(pts);
    cv.fillPoly(mask, ptsVec, new cv.Scalar(255));
    pts.delete();
    ptsVec.delete();

    hexMaskCache = { width, height, mask };
    return mask;
}

function getBlobAreaRange(width) {
    const scale = width / VIEWBOX_SIZE;
    const radiusPx = Math.max(5, 9 * scale);
    const area = Math.PI * radiusPx * radiusPx;
    return {
        minArea: area * 0.35,
        maxArea: area * 2.8,
    };
}

function classifyColor(rgb) {
    const [h, s, v] = rgbToHsv(rgb);
    if (s < SAT_MIN || v < VAL_MIN) return null;
    return Object.keys(COLORS).find(key => hsvInRange(h, s, v, COLORS[key].hsvLow, COLORS[key].hsvHigh)) || null;
}

function rgbToHsv({ r, g, b }) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return [Math.round(h / 2), Math.round(s * 255), Math.round(v * 255)];
}

function hsvInRange(h, s, v, low, high) {
    const [h1, s1, v1] = low;
    const [h2, s2, v2] = high;
    const satOk = s >= s1 && s <= s2;
    const valOk = v >= v1 && v <= v2;
    if (!satOk || !valOk) return false;
    if (h1 <= h2) return h >= h1 && h <= h2;
    return h >= h1 || h <= h2;
}

function buildTriangleCenters(pins) {
    const edges = new Set();
    const byId = pins.map((p, idx) => ({ ...p, idx }));
    for (let i = 0; i < byId.length; i += 1) {
        for (let j = i + 1; j < byId.length; j += 1) {
            const dx = byId[i].x - byId[j].x;
            const dy = byId[i].y - byId[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dist - 43.3) <= 1.2) {
                edges.add(`${i}-${j}`);
            }
        }
    }

    const centers = [];
    for (let i = 0; i < byId.length; i += 1) {
        for (let j = i + 1; j < byId.length; j += 1) {
            if (!edges.has(`${i}-${j}`)) continue;
            for (let k = j + 1; k < byId.length; k += 1) {
                if (!edges.has(`${i}-${k}`) || !edges.has(`${j}-${k}`)) continue;
                const cx = (byId[i].x + byId[j].x + byId[k].x) / 3;
                const cy = (byId[i].y + byId[j].y + byId[k].y) / 3;
                centers.push({ x: cx, y: cy });
            }
        }
    }
    return centers;
}

function mapViewBoxToSample(center) {
    const x = ((center.x + VIEWBOX_HALF) / VIEWBOX_SIZE) * sampleCanvas.width;
    const y = ((center.y + VIEWBOX_HALF) / VIEWBOX_SIZE) * sampleCanvas.height;
    if (x < 0 || y < 0 || x >= sampleCanvas.width || y >= sampleCanvas.height) return null;
    return { x, y };
}

function buildAlignmentLayout() {
    if (!el.overlaySvg) return;
    const rect = el.overlaySvg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sizeBase = Math.min(rect.width, rect.height);
    const maxSampleSize = 480;
    const minSampleSize = 180;
    const scaleFactor = Math.min(1, maxSampleSize / sizeBase);
    const size = Math.max(minSampleSize, Math.round(sizeBase * scaleFactor));
    sampleCanvas.width = size;
    sampleCanvas.height = size;
    cvInputCanvas.width = size;
    cvInputCanvas.height = size;
    sampleCtx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    if (el.overlayCanvas) {
        el.overlayCanvas.width = Math.max(1, Math.round(rect.width * dpr));
        el.overlayCanvas.height = Math.max(1, Math.round(rect.height * dpr));
        const overlayCtx = el.overlayCanvas.getContext('2d');
        if (overlayCtx) {
            overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }
    alignmentLayout = { size, rect };
}

function startAlignmentLoop() {
    if (alignmentLoopId) return;
    alignmentLoopId = requestAnimationFrame(runAlignmentLoop);
}

function stopAlignmentLoop() {
    if (!alignmentLoopId) return;
    cancelAnimationFrame(alignmentLoopId);
    alignmentLoopId = null;
    if (el.overlayCanvas) {
        const ctx = el.overlayCanvas.getContext('2d');
        if (ctx && alignmentLayout?.rect) {
            ctx.clearRect(0, 0, alignmentLayout.rect.width, alignmentLayout.rect.height);
        }
        el.overlayCanvas.classList.remove('locked');
    }
}

function runAlignmentLoop(timestamp) {
    alignmentLoopId = requestAnimationFrame(runAlignmentLoop);
    if (scanInProgress) return;
    if (!cvReady || !alignmentLayout || !el.video) return;
    const now = timestamp || performance.now();
    if (now - lastAlignmentSample < ALIGN_SAMPLE_INTERVAL) return;
    lastAlignmentSample = now;
    alignmentActive = detectAndWarpHex();
    updateAlignmentOverlay();
    updateScanReadyState();
}

function updateScanReadyState() {
    if (!el.instructionText || !el.scanBtn) return;
    const isGameView = document.getElementById('view-game')?.classList.contains('active-view');
    if (!isGameView) return;
    if (!cvReady) {
        setScanReady(true, 'Ausrichten und SCAN');
        return;
    }
    if (alignmentActive) {
        setScanReady(true, 'Ausrichten und SCAN');
    } else {
        setScanReady(false, 'Board ausrichten...');
    }
}

async function configureCamera(track) {
    if (!track?.getCapabilities || !track.applyConstraints) return;
    const caps = track.getCapabilities();
    const advanced = [];

    if (caps.exposureMode?.includes('continuous')) {
        advanced.push({ exposureMode: 'continuous' });
    }
    if (caps.whiteBalanceMode?.includes('continuous')) {
        advanced.push({ whiteBalanceMode: 'continuous' });
    }
    if (caps.focusMode?.includes('continuous')) {
        advanced.push({ focusMode: 'continuous' });
    }
    if (caps.focusMode?.includes('auto')) {
        advanced.push({ focusMode: 'auto' });
    }

    if (!advanced.length) return;
    try {
        await track.applyConstraints({ advanced });
    } catch (err) {
        console.warn('Camera constraints failed', err);
    }
}

function waitForOpenCv(timeoutMs = 15000) {
    return new Promise((resolve) => {
        const start = performance.now();
        const timer = window.setInterval(() => {
            if (window.cv && window.cv.Mat) {
                window.clearInterval(timer);
                resolve(true);
                return;
            }
            if (performance.now() - start > timeoutMs) {
                window.clearInterval(timer);
                resolve(false);
            }
        }, 60);
    });
}

function orderHexPoints(contour) {
    const points = [];
    for (let i = 0; i < contour.rows; i += 1) {
        points.push({ x: contour.intPtr(i, 0)[0], y: contour.intPtr(i, 0)[1] });
    }

    const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;

    points.sort((a, b) => {
        const angleA = Math.atan2(a.y - cy, a.x - cx);
        const angleB = Math.atan2(b.y - cy, b.x - cx);
        return angleA - angleB;
    });

    let topIndex = 0;
    for (let i = 1; i < points.length; i += 1) {
        const current = points[i];
        const best = points[topIndex];
        if (current.y < best.y || (current.y === best.y && current.x < best.x)) {
            topIndex = i;
        }
    }

    return points.slice(topIndex).concat(points.slice(0, topIndex));
}

function clipHexPath(ctx, width, height) {
    ctx.beginPath();
    HEX_POINTS.forEach(([x, y], index) => {
        const px = x * width;
        const py = y * height;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();
}

function updateAlignmentOverlay() {
    if (!el.overlayCanvas || !alignmentLayout) return;
    const ctx = el.overlayCanvas.getContext('2d');
    if (!ctx) return;
    const { rect } = alignmentLayout;
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!alignmentActive) {
        el.overlayCanvas.classList.remove('locked');
        return;
    }

    ctx.save();
    clipHexPath(ctx, rect.width, rect.height);
    ctx.drawImage(sampleCanvas, 0, 0, rect.width, rect.height);
    ctx.restore();
    el.overlayCanvas.classList.add('locked');
}

function findBestHexFromBinary(binaryMat, minArea) {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    let bestApprox = null;
    let bestArea = 0;

    try {
        cv.findContours(
            binaryMat,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );

        for (let i = 0; i < contours.size(); i += 1) {
            const contour = contours.get(i);
            const area = cv.contourArea(contour);
            if (area < minArea) {
                contour.delete();
                continue;
            }

            const peri = cv.arcLength(contour, true);
            const approx = new cv.Mat();
            cv.approxPolyDP(contour, approx, DETECTION.approxEpsilon * peri, true);

            if (approx.rows === 6 && cv.isContourConvex(approx)) {
                if (area > bestArea) {
                    if (bestApprox) {
                        bestApprox.delete();
                    }
                    bestApprox = approx;
                    bestArea = area;
                } else {
                    approx.delete();
                }
            } else {
                approx.delete();
            }

            contour.delete();
        }
    } finally {
        contours.delete();
        hierarchy.delete();
    }

    return { bestApprox, bestArea };
}

function detectAndWarpHex() {
    if (!cvReady || !alignmentLayout || !el.video || !el.video.videoWidth) {
        return false;
    }

    drawVideoCover(cvInputCtx, el.video, cvInputCanvas.width, cvInputCanvas.height);

    const src = cv.imread(cvInputCanvas);
    const gray = new cv.Mat();
    const grayEq = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const thresh = new cv.Mat();
    const morphed = new cv.Mat();
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    let bestApprox = null;
    let aligned = false;

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.equalizeHist(gray, grayEq);
        cv.GaussianBlur(
            grayEq,
            blurred,
            new cv.Size(DETECTION.blurSize, DETECTION.blurSize),
            0
        );
        cv.Canny(blurred, edges, DETECTION.cannyLow, DETECTION.cannyHigh);
        const minArea = cvInputCanvas.width * cvInputCanvas.height * DETECTION.minAreaRatio;
        const edgeResult = findBestHexFromBinary(edges, minArea);
        bestApprox = edgeResult.bestApprox;

        if (!bestApprox) {
            cv.adaptiveThreshold(
                grayEq,
                thresh,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY,
                21,
                7
            );
            cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);
            const threshResult = findBestHexFromBinary(morphed, minArea);
            bestApprox = threshResult.bestApprox;
        }

        if (!bestApprox) {
            return false;
        }

        const ordered = orderHexPoints(bestApprox);
        const destPoints = HEX_POINTS.map(([x, y]) => ({
            x: x * sampleCanvas.width,
            y: y * sampleCanvas.height,
        }));

        const srcMat = cv.matFromArray(
            ordered.length,
            1,
            cv.CV_32FC2,
            ordered.flatMap((point) => [point.x, point.y])
        );
        const dstMat = cv.matFromArray(
            destPoints.length,
            1,
            cv.CV_32FC2,
            destPoints.flatMap((point) => [point.x, point.y])
        );
        const homography = cv.findHomography(srcMat, dstMat);
        const warped = new cv.Mat();

        try {
            if (homography.empty()) {
                return false;
            }
            cv.warpPerspective(
                src,
                warped,
                homography,
                new cv.Size(sampleCanvas.width, sampleCanvas.height),
                cv.INTER_LINEAR,
                cv.BORDER_CONSTANT,
                new cv.Scalar(0, 0, 0, 255)
            );
            cv.imshow(sampleCanvas, warped);
            aligned = true;
        } finally {
            srcMat.delete();
            dstMat.delete();
            homography.delete();
            warped.delete();
        }
    } finally {
        src.delete();
        gray.delete();
        grayEq.delete();
        blurred.delete();
        edges.delete();
        thresh.delete();
        morphed.delete();
        kernel.delete();
        if (bestApprox) {
            bestApprox.delete();
        }
    }

    return aligned;
}

function showResults() {
    el.controlsSheet?.classList.remove('hidden');
    const ranked = [...players].sort((a, b) => b.score - a.score);
    const winner = ranked[0];

    if (winner.score > 0) {
        el.winnerMsg.textContent = `Gewinner: ${winner.name}`;
        if (typeof confetti === 'function') {
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }
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
}

function clearHistory() {
    if (confirm('L\u00f6schen?')) {
        localStorage.removeItem(HISTORY_KEY);
        localStorage.removeItem('nxt_games_v21');
        localStorage.setItem(HISTORY_CLEAR_KEY, '1');
        renderHistory();
    }
}

function loadHistory() {
    if (localStorage.getItem(HISTORY_CLEAR_KEY) === '1') return [];
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
    const filtered = filterHistoryByRange(hist);

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">Keine Daten</div>';
        renderStats([]);
        return;
    }

    list.innerHTML = filtered.slice().reverse().map(h => {
        const d = new Date(h.date).toLocaleDateString();
        return `
            <div class="history-item">
                <div>
                    <div class="hist-winner">Gewinner: ${h.winner} (${h.topScore})</div>
                    <div style="font-size:0.8rem;color:#6f8b8d">${h.details}</div>
                </div>
                <div style="font-size:0.8rem;color:#6f8b8d">${d}</div>
            </div>
        `;
    }).join('');

    renderStats(filtered);
}

function renderStats(hist) {
    if (!el.statsTotal || !el.statsTop || !el.statsAvg || !el.statsLast || !el.statsLeaderboard || !el.statsStreak) return;

    if (!hist.length) {
        el.statsTotal.textContent = '0';
        el.statsTop.textContent = '-';
        el.statsAvg.textContent = '0';
        el.statsLast.textContent = '-';
        el.statsLeaderboard.innerHTML = '<div class="empty-state">Noch keine Spieldaten</div>';
        el.statsStreak.innerHTML = '<div class="empty-state">Noch keine Spieldaten</div>';
        return;
    }

    const wins = {};
    const topScores = [];
    hist.forEach(h => {
        wins[h.winner] = (wins[h.winner] || 0) + 1;
        topScores.push(h.topScore || 0);
    });
    const entries = Object.entries(wins).filter(([name]) => name !== '-');
    entries.sort((a, b) => b[1] - a[1]);

    const avgTop = Math.round(topScores.reduce((a, b) => a + b, 0) / topScores.length);
    const lastGame = hist[hist.length - 1];

    el.statsTotal.textContent = `${hist.length}`;
    el.statsTop.textContent = entries[0] ? `${entries[0][0]} (${entries[0][1]})` : '-';
    el.statsAvg.textContent = `${avgTop}`;
    el.statsLast.textContent = lastGame ? new Date(lastGame.date).toLocaleDateString() : '-';

    el.statsLeaderboard.innerHTML = entries.slice(0, 3).map(([name, count], idx) => `
        <div class="stats-row">
            <span>#${idx + 1} ${name}</span>
            <strong>${count} Siege</strong>
        </div>
    `).join('') || '<div class="empty-state">Noch keine Spieldaten</div>';

    const streak = getCurrentStreak(hist);
    if (!streak) {
        el.statsStreak.innerHTML = '<div class="empty-state">Keine Serie</div>';
    } else {
        el.statsStreak.innerHTML = `
            <div class="stats-row">
                <span>${streak.name}</span>
                <strong>${streak.count} in Folge</strong>
            </div>
        `;
    }
}

function filterHistoryByRange(hist) {
    if (historyRangeDays === 'all') return hist;
    const days = Number(historyRangeDays);
    if (!days) return hist;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return hist.filter(entry => {
        const time = new Date(entry.date).getTime();
        return Number.isFinite(time) && time >= cutoff;
    });
}

function getCurrentStreak(hist) {
    if (!hist.length) return null;
    let count = 0;
    let name = null;
    for (let i = hist.length - 1; i >= 0; i -= 1) {
        const winner = hist[i].winner;
        if (!winner || winner === '-') break;
        if (!name) {
            name = winner;
            count = 1;
            continue;
        }
        if (winner === name) count += 1;
        else break;
    }
    if (!name) return null;
    return { name, count };
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
    else if (isAndroid) show(`1. Tippe auf Men\u00fc<br>2. "App installieren"`);
}

function registerServiceWorker() {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.warn('SW failed', err));
    }
}
