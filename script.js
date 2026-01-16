/**
 * NXT Game Scanner v21.2
 * Hex-Grid Sampling (centroid only)
 */

// ============================================
// 1. KONFIGURATION
// ============================================
const PIN_GRID = [
    { id: 1, x: -112.5, y: -64.95 }, { id: 2, x: -112.5, y: -21.65 }, { id: 3, x: -112.5, y: 21.65 }, { id: 4, x: -112.5, y: 64.95 },
    { id: 5, x: -75.0, y: -86.60 }, { id: 6, x: -75.0, y: -43.30 }, { id: 7, x: -75.0, y: 0.00 }, { id: 8, x: -75.0, y: 43.30 }, { id: 9, x: -75.0, y: 86.60 },
    { id: 10, x: -37.5, y: -108.25 }, { id: 11, x: -37.5, y: -64.95 }, { id: 12, x: -37.5, y: -21.65 }, { id: 13, x: -37.5, y: 21.65 }, { id: 14, x: -37.5, y: 64.95 }, { id: 15, x: -37.5, y: 108.25 },
    { id: 16, x: 0.0, y: -129.90 }, { id: 17, x: 0.0, y: -86.60 }, { id: 18, x: 0.0, y: -43.30 }, { id: 19, x: 0.0, y: 0.00 }, { id: 20, x: 0.0, y: 43.30 }, { id: 21, x: 0.0, y: 86.60 }, { id: 22, x: 0.0, y: 129.90 },
    { id: 23, x: 37.5, y: -108.25 }, { id: 24, x: 37.5, y: -64.95 }, { id: 25, x: 37.5, y: -21.65 }, { id: 26, x: 37.5, y: 21.65 }, { id: 27, x: 37.5, y: 64.95 }, { id: 28, x: 37.5, y: 108.25 },
    { id: 29, x: 75.0, y: -86.60 }, { id: 30, x: 75.0, y: -43.30 }, { id: 31, x: 75.0, y: 0.00 }, { id: 32, x: 75.0, y: 43.30 }, { id: 33, x: 75.0, y: 86.60 },
    { id: 34, x: 112.5, y: -64.95 }, { id: 35, x: 112.5, y: -21.65 }, { id: 36, x: 112.5, y: 21.65 }, { id: 37, x: 112.5, y: 64.95 }
];

const GRID_STEP_MM = 43.3;
const GRID_STEP_TOL = 1.2;

const COLORS = {
    magenta: { name: 'Magenta', hex: '#E91E63', hsvLow: [135, 60, 60], hsvHigh: [175, 255, 255] },
    yellow:  { name: 'Gelb',    hex: '#FFEB3B', hsvLow: [15, 80, 80],  hsvHigh: [40, 255, 255] },
    blue:    { name: 'Blau',    hex: '#2196F3', hsvLow: [95, 80, 60],  hsvHigh: [130, 255, 255] },
    green:   { name: 'Grün',    hex: '#4CAF50', hsvLow: [40, 60, 50],  hsvHigh: [85, 255, 255] }
};

const HISTORY_KEY = 'nxt_games_v21';

let players = [
    { name: 'Spieler 1', colorKey: 'magenta', score: 0 },
    { name: 'Spieler 2', colorKey: 'yellow', score: 0 }
];

let stream = null;
let isRendering = false;
let layout = null;
let lastSampleTime = 0;
let lastAverages = [];

const el = {};

const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

const hexPoints = [
    [0.25, 0.0],
    [0.75, 0.0],
    [1.0, 0.5],
    [0.75, 1.0],
    [0.25, 1.0],
    [0.0, 0.5],
];
const axisAngles = [0, Math.PI / 3, -Math.PI / 3];
const sampleInterval = 160;

function onOpenCvReady() {
    // OpenCV wird nicht benötigt, aber der Callback existiert fürs Script-Tag.
}

// ============================================
// 2. INITIALISIERUNG
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initSvgGrid();
    initEventListeners();
    enforceUniqueColors();
    renderPlayers();
    renderHistory();
    checkInstallPrompt();
    registerServiceWorker();
    initLayoutObservers();
});

function initElements() {
    el.video = document.getElementById('video');
    el.canvas = document.getElementById('canvas');
    el.gridCanvas = document.getElementById('overlay-canvas');
    el.instructionText = document.getElementById('instruction-text');
    el.gridOverlay = document.querySelector('.hex-grid-overlay');
    el.hexShell = document.querySelector('.hexagon-frame');
    el.pixelToggle = document.getElementById('pixelToggle');
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
    if (!el.gridOverlay || !el.pinGroup || !el.gridLines) return;
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
            if (Math.abs(dist - GRID_STEP_MM) <= GRID_STEP_TOL) {
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

function initLayoutObservers() {
    if (!el.hexShell) return;
    const resizeObserver = new ResizeObserver(() => {
        buildLayout();
    });
    resizeObserver.observe(el.hexShell);
    window.addEventListener('orientationchange', buildLayout);
    window.addEventListener('resize', buildLayout);
    buildLayout();
}

// ============================================
// 3. NAVIGATION & SPIELER
// ============================================
function toggleMenu() {
    el.sideMenu?.classList.toggle('open');
    el.menuOverlay?.classList.toggle('open');
}
function closeMenu() {
    el.sideMenu?.classList.remove('open');
    el.menuOverlay?.classList.remove('open');
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    document.getElementById(viewId)?.classList.add('active-view');
    if (el.homeBtn) {
        if (viewId === 'view-setup') el.homeBtn.classList.add('hidden');
        else el.homeBtn.classList.remove('hidden');
    }
    if (viewId === 'view-game') {
        startCamera();
        startRenderLoop();
    } else {
        stopCamera();
        stopRenderLoop();
    }
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

// ============================================
// 4. KAMERA & RENDER LOOP
// ============================================
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
            setScanReady(true, 'Bereit - drücke SCAN');
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

function startRenderLoop() {
    if (isRendering) return;
    isRendering = true;
    requestAnimationFrame(renderFrame);
}

function stopRenderLoop() {
    isRendering = false;
    if (el.gridCanvas) {
        const ctx = el.gridCanvas.getContext('2d');
        ctx?.clearRect(0, 0, el.gridCanvas.width, el.gridCanvas.height);
    }
}

function resetGameUI() {
    el.controlsSheet?.classList.add('hidden');
    el.canvas.style.display = 'none';
    el.video.style.display = 'block';
    setScanReady(false, 'Starte Kamera...');
}

function setScanReady(ready, message) {
    if (el.instructionText) el.instructionText.textContent = message || '';
    if (el.scanBtn) el.scanBtn.disabled = !ready;
    if (ready) el.scanBtn?.classList.add('active'); else el.scanBtn?.classList.remove('active');
    if (ready) el.gridOverlay?.classList.add('ready'); else el.gridOverlay?.classList.remove('ready');
}

// ============================================
// 5. HEX-GRID LAYOUT (PRINZIP)
// ============================================
function getLineCount() {
    const lines = Number.parseInt(el.hexShell?.dataset.lines, 10);
    if (Number.isFinite(lines) && lines > 0) return lines;
    return 5;
}

function getHexPolygon(width, height) {
    return hexPoints.map(([x, y]) => ({ x: x * width, y: y * height }));
}

function clipHex(ctx, width, height) {
    ctx.beginPath();
    hexPoints.forEach(([x, y], index) => {
        const px = x * width;
        const py = y * height;
        if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();
}

function drawPolygonPath(ctx, points) {
    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
}

function clipPolygon(points, cx, cy, nx, ny, d, keepGreater) {
    if (points.length === 0) return [];
    const output = [];
    for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const currentDot = (current.x - cx) * nx + (current.y - cy) * ny;
        const nextDot = (next.x - cx) * nx + (next.y - cy) * ny;
        const currentInside = keepGreater ? currentDot >= d : currentDot <= d;
        const nextInside = keepGreater ? nextDot >= d : nextDot <= d;

        if (currentInside && nextInside) {
            output.push({ x: next.x, y: next.y });
        } else if (currentInside && !nextInside) {
            const denom = nextDot - currentDot;
            if (Math.abs(denom) > 1e-6) {
                const t = (d - currentDot) / denom;
                output.push({
                    x: current.x + (next.x - current.x) * t,
                    y: current.y + (next.y - current.y) * t,
                });
            }
        } else if (!currentInside && nextInside) {
            const denom = nextDot - currentDot;
            if (Math.abs(denom) > 1e-6) {
                const t = (d - currentDot) / denom;
                output.push({
                    x: current.x + (next.x - current.x) * t,
                    y: current.y + (next.y - current.y) * t,
                });
            }
            output.push({ x: next.x, y: next.y });
        }
    }
    return output;
}

function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
}

function polygonCentroid(points, signedArea) {
    const area = signedArea || polygonArea(points);
    if (Math.abs(area) < 1e-6) {
        const total = points.reduce(
            (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
            { x: 0, y: 0 }
        );
        return { x: total.x / points.length, y: total.y / points.length };
    }

    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const factor = current.x * next.y - next.x * current.y;
        cx += (current.x + next.x) * factor;
        cy += (current.y + next.y) * factor;
    }
    const scale = 1 / (6 * area);
    return { x: cx * scale, y: cy * scale };
}

function buildCells(hexPolygon, axes, width, height, lineCount) {
    const cx = width / 2;
    const cy = height / 2;
    const bandCount = Math.max(1, lineCount - 1);
    const cells = [];

    for (let a = 0; a < bandCount; a += 1) {
        for (let b = 0; b < bandCount; b += 1) {
            for (let c = 0; c < bandCount; c += 1) {
                let polygon = hexPolygon.map(point => ({ ...point }));
                const bandIndices = [a, b, c];

                axes.forEach((axis, axisIndex) => {
                    const d0 = axis.offsets[bandIndices[axisIndex]];
                    const d1 = axis.offsets[bandIndices[axisIndex] + 1];
                    const minD = Math.min(d0, d1);
                    const maxD = Math.max(d0, d1);
                    polygon = clipPolygon(polygon, cx, cy, axis.nx, axis.ny, minD, true);
                    polygon = clipPolygon(polygon, cx, cy, axis.nx, axis.ny, maxD, false);
                });

                if (polygon.length < 3) continue;
                const signedArea = polygonArea(polygon);
                const area = Math.abs(signedArea);
                if (area < 1) continue;

                cells.push({
                    polygon,
                    centroid: polygonCentroid(polygon, signedArea),
                    area,
                });
            }
        }
    }
    return cells;
}

function buildLayout() {
    if (!el.gridCanvas || !el.hexShell) return;
    const ctx = el.gridCanvas.getContext('2d');
    const rect = el.gridCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    el.gridCanvas.width = Math.round(rect.width * dpr);
    el.gridCanvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const lineCount = getLineCount();
    const apothem = rect.height / 2;
    const spacing = lineCount > 1 ? apothem / ((lineCount - 1) / 2) : apothem;
    const offsets = Array.from({ length: lineCount }, (_, index) => {
        return (index - (lineCount - 1) / 2) * spacing;
    });

    const axes = axisAngles.map(angle => {
        return {
            angle,
            dx: Math.cos(angle),
            dy: Math.sin(angle),
            nx: Math.cos(angle + Math.PI / 2),
            ny: Math.sin(angle + Math.PI / 2),
            offsets,
        };
    });

    const hexPolygon = getHexPolygon(rect.width, rect.height);
    const cells = buildCells(hexPolygon, axes, rect.width, rect.height, lineCount);

    const maxSampleSize = 340;
    const minSampleSize = 160;
    const scaleFactor = Math.min(1, maxSampleSize / Math.max(rect.width, rect.height));
    const sampleWidth = Math.max(minSampleSize, Math.round(rect.width * scaleFactor));
    const sampleHeight = Math.max(Math.round(rect.height * scaleFactor), Math.round(sampleWidth * (rect.height / rect.width)));

    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    const scaleX = sampleWidth / rect.width;
    const scaleY = sampleHeight / rect.height;

    const samplePoints = cells.map(cell => ({
        x: cell.centroid.x * scaleX,
        y: cell.centroid.y * scaleY,
    }));

    const totalArea = cells.reduce((sum, cell) => sum + cell.area, 0);
    const avgArea = cells.length ? totalArea / cells.length : 0;
    const fontSize = Math.max(8, Math.round(Math.sqrt(avgArea) * 0.28));

    layout = {
        rect,
        ctx,
        lineCount,
        spacing,
        axes,
        hexPolygon,
        cells,
        samplePoints,
        fontSize,
    };
}

function samplePointColor(point, data, width, height, jitter) {
    const offsets = [
        [0, 0],
        [jitter, 0],
        [-jitter, 0],
        [0, jitter],
        [0, -jitter],
        [jitter, jitter],
        [-jitter, jitter],
        [jitter, -jitter],
        [-jitter, -jitter],
    ];

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    offsets.forEach(([dx, dy]) => {
        const x = Math.round(point.x + dx);
        const y = Math.round(point.y + dy);
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = (y * width + x) * 4;
        sumR += data[index];
        sumG += data[index + 1];
        sumB += data[index + 2];
        count += 1;
    });

    if (!count) return { r: 0, g: 0, b: 0 };
    return {
        r: Math.round(sumR / count),
        g: Math.round(sumG / count),
        b: Math.round(sumB / count),
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = value => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function renderFrame(timestamp) {
    if (!isRendering) return;
    requestAnimationFrame(renderFrame);
    if (!layout || !el.gridCanvas) return;

    const now = timestamp || performance.now();
    if (now - lastSampleTime < sampleInterval) return;
    lastSampleTime = now;

    const { ctx, rect, cells, samplePoints, fontSize } = layout;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    clipHex(ctx, rect.width, rect.height);

    let averages = [];
    if (el.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        sampleCtx.drawImage(el.video, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const frame = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
        const jitter = Math.max(2, Math.round(Math.min(sampleCanvas.width, sampleCanvas.height) / 160));
        averages = samplePoints.map(point => samplePointColor(point, frame.data, sampleCanvas.width, sampleCanvas.height, jitter));
        lastAverages = averages;
    }

    const overlayEnabled = el.pixelToggle ? el.pixelToggle.checked : false;
    if (overlayEnabled) {
        cells.forEach((cell, index) => {
            const color = averages[index] || { r: 0, g: 0, b: 0 };
            ctx.fillStyle = rgbToHex(color);
            drawPolygonPath(ctx, cell.polygon);
            ctx.fill();
        });

        ctx.font = `${fontSize}px "Source Sans Pro", "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = Math.max(3, fontSize * 0.5);
        cells.forEach((cell, index) => {
            const color = averages[index] || { r: 0, g: 0, b: 0 };
            ctx.fillStyle = '#ffffff';
            ctx.fillText(rgbToHex(color), cell.centroid.x, cell.centroid.y);
        });
    }

    ctx.restore();
}

function sampleColors() {
    if (!layout || el.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return [];
    const { samplePoints } = layout;
    sampleCtx.drawImage(el.video, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const frame = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const jitter = Math.max(2, Math.round(Math.min(sampleCanvas.width, sampleCanvas.height) / 160));
    return samplePoints.map(point => samplePointColor(point, frame.data, sampleCanvas.width, sampleCanvas.height, jitter));
}

// ============================================
// 6. SCAN & FARBANALYSE
// ============================================
function triggerScan() {
    if (!layout) return;
    el.instructionText.textContent = 'Analysiere...';

    const averages = lastAverages.length ? lastAverages : sampleColors();
    const counts = Object.keys(COLORS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

    averages.forEach(avg => {
        const colorKey = classifyColor(avg);
        if (colorKey) counts[colorKey] += 1;
    });

    players.forEach(p => {
        p.score = counts[p.colorKey] || 0;
    });

    showResults();
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

function classifyColor(avg) {
    const [h, s, v] = rgbToHsv(avg);
    if (v < 40 || s < 40) return null;
    return Object.keys(COLORS).find(key => hsvInRange(h, s, v, COLORS[key].hsvLow, COLORS[key].hsvHigh)) || null;
}

// ============================================
// 7. ERGEBNIS & VERLAUF
// ============================================
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
    setScanReady(true, 'Bereit - drücke SCAN');
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
        const legacy = JSON.parse(localStorage.getItem('nxt_games_v20') || '[]');
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
        let d = new Date(h.date).toLocaleDateString();
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

// ============================================
// 8. INSTALLATION (PWA)
// ============================================
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
