// programs.js - Programmes de marche automatiques
//
// Chaque programme est une liste de points [minute, vitesse en km/h].
// Entre deux points, la vitesse varie progressivement (interpolation linéaire).
// Un palier = deux points à la même vitesse. Le tapis s'arrête au dernier point.
// Vitesse possible : de 1 à 6 km/h.
// level : difficulté de 1 (facile) à 5 (difficile). La liste est triée par
// difficulté puis par durée ; la durée et la vitesse max sont calculées automatiquement.

// Enchaîne `count` fois : `fastMin` minutes à `fast` km/h puis `slowMin` minutes à `slow` km/h
function intervals(start, count, fastMin, fast, slowMin, slow) {
    const points = [];
    let t = start;
    for (let i = 0; i < count; i++) {
        points.push([t + 0.25, fast], [t + fastMin, fast], [t + fastMin + 0.25, slow], [t + fastMin + slowMin, slow]);
        t += fastMin + slowMin;
    }
    return points;
}

const PROGRAMS = [
    {
        name: "Marche douce",
        level: 1,
        description: "Rythme tranquille à 3 km/h",
        points: [[0, 1.5], [3, 3], [12, 3], [15, 1]]
    },
    {
        name: "Marche tranquille",
        level: 1,
        description: "Allure régulière à 3,5 km/h",
        points: [[0, 2], [3, 3.5], [22, 3.5], [25, 1.5]]
    },
    {
        name: "Marche progressive",
        level: 2,
        description: "Démarrage lent, 5 km/h, pointe à 6 km/h",
        points: [
            [0, 2], [2, 2],       // démarrage lent
            [4, 5],               // montée progressive jusqu'à 5 km/h
            [10, 5], [10.5, 6],   // passage à 6 km/h
            [12, 6], [12.5, 5],   // retour à 5 km/h
            [18, 5], [20, 1]      // ralentissement final
        ]
    },
    {
        name: "Endurance",
        level: 2,
        description: "25 minutes à 5 km/h",
        points: [[0, 2], [3, 4.5], [5, 5], [26, 5], [28, 3], [30, 1.5]]
    },
    {
        name: "Fractionné",
        level: 3,
        description: "4 accélérations de 2 min à 6 km/h, récupération à 4 km/h",
        points: [[0, 2], [3, 4], [5, 4], ...intervals(5, 4, 2, 6, 3, 4), [27, 4], [30, 1]]
    },
    {
        name: "Pyramide",
        level: 3,
        description: "Paliers de 3,5 à 6 km/h, puis redescente",
        points: [
            [0, 2], [3, 3.5], [7, 3.5],
            [7.5, 4.5], [11, 4.5],
            [11.5, 5], [15, 5],
            [15.5, 5.5], [19, 5.5],
            [19.5, 6], [22, 6],       // sommet
            [22.5, 5.5], [25, 5.5],
            [25.5, 5], [28, 5],
            [28.5, 4.5], [31, 4.5],
            [35, 1.5]
        ]
    },
    {
        name: "Endurance longue",
        level: 4,
        description: "28 minutes de marche rapide à 5,5 km/h",
        points: [[0, 2], [3, 4], [6, 5.5], [34, 5.5], [37, 3.5], [40, 1.5]]
    },
    {
        name: "Fractionné intensif",
        level: 4,
        description: "10 × (1 min 30 à 6 km/h + 1 min 30 à 4,5 km/h)",
        points: [[0, 2], [3, 4], [5, 4.5], ...intervals(5, 10, 1.5, 6, 1.5, 4.5), [40, 1.5]]
    },
    {
        name: "Défi 45",
        level: 5,
        description: "6 × (3 min à 6 km/h + 2 min à 5 km/h), allure soutenue",
        points: [[0, 2], [3, 4], [5, 5], [8, 5.5], ...intervals(8, 6, 3, 6, 2, 5), [41, 5.5], [45, 1.5]]
    }
].sort((a, b) => a.level - b.level || programDuration(a) - programDuration(b));

const MAX_LEVEL = 5;

// --- UI Elements ---
// Home page
const programBtn = document.getElementById('programBtn');
const programTarget = document.getElementById('programTarget');
const programTime = document.getElementById('programTime');
const programProfile = document.getElementById('programProfile');
const programCursor = document.getElementById('programCursor');
// Program selection modal
const programModal = document.getElementById('programModal');
const programList = document.getElementById('programList');
const previewMax = document.getElementById('previewMax');
const previewDuration = document.getElementById('previewDuration');
const previewProfile = document.getElementById('previewProfile');
const programModalHint = document.getElementById('programModalHint');
const programLaunchBtn = document.getElementById('programLaunchBtn');
const programCancelBtn = document.getElementById('programCancelBtn');
const programModalClose = document.getElementById('programModalClose');

const PROFILE_WIDTH = 300;
const PROFILE_HEIGHT = 50;
const MAX_SPEED = 6;

// --- State ---
let selectedProgram = 0;
let activeProgram = null; // { program, elapsed (s), lastTick (ms), started }
let wakeLock = null;

// --- Helper Functions ---
function programDuration(program) {
    return program.points[program.points.length - 1][0] * 60;
}

function programMaxSpeed(program) {
    return clampSpeed(Math.max(...program.points.map(([, v]) => v)));
}

function programSpeedAt(program, seconds) {
    const minute = seconds / 60;
    const pts = program.points;
    if (minute <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
        const [t0, v0] = pts[i - 1];
        const [t1, v1] = pts[i];
        if (minute <= t1) {
            return t1 === t0 ? v1 : v0 + (v1 - v0) * (minute - t0) / (t1 - t0);
        }
    }
    return pts[pts.length - 1][1];
}

// Speed in km/h rounded to 0.1, limited to what the treadmill accepts
function clampSpeed(kph) {
    return Math.min(MAX_SPEED, Math.max(1, Math.round(kph * 10) / 10));
}

function formatClock(seconds) {
    seconds = Math.floor(seconds);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + String(s).padStart(2, '0');
}

async function requestWakeLock() {
    // Keep the screen on, otherwise the phone may stop talking to the treadmill
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch {}
}
function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
    }
}
document.addEventListener('visibilitychange', () => {
    if (activeProgram && document.visibilityState === 'visible') requestWakeLock();
});

// --- Rendering ---
function renderProgramProfile(svg, program) {
    const total = programDuration(program);
    const coords = program.points.map(([t, v]) => {
        const x = (t * 60 / total) * PROFILE_WIDTH;
        const y = PROFILE_HEIGHT - (v / MAX_SPEED) * (PROFILE_HEIGHT - 4);
        return x.toFixed(1) + ',' + y.toFixed(1);
    });
    svg.querySelector('.profile-line').setAttribute('d', 'M' + coords.join(' L'));
    svg.querySelector('.profile-area').setAttribute('d', 'M0,' + PROFILE_HEIGHT + ' L' + coords.join(' L') + ' L' + PROFILE_WIDTH + ',' + PROFILE_HEIGHT + ' Z');
}

function updateProgramUI() {
    const running = !!activeProgram;
    document.body.classList.toggle('program-running', running);
    programBtn.textContent = running ? "■ ARRÊTER LE PROGRAMME" : "▶ PROGRAMMES";
    if (!running) return;
    const program = activeProgram.program;
    const total = programDuration(program);
    const elapsed = Math.min(activeProgram.elapsed, total);
    programTarget.textContent = "Cible : " + clampSpeed(programSpeedAt(program, elapsed)).toFixed(1) + " km/h";
    programTime.textContent = formatClock(elapsed) + " / " + formatClock(total);
    const x = (elapsed / total) * PROFILE_WIDTH;
    programCursor.setAttribute('x1', x);
    programCursor.setAttribute('x2', x);
}

// --- Program Selection Modal ---
function selectProgram(index) {
    selectedProgram = index;
    programList.querySelectorAll('.program-item').forEach((el, i) => {
        el.setAttribute('aria-checked', i === index);
    });
    const program = PROGRAMS[index];
    renderProgramProfile(previewProfile, program);
    previewMax.textContent = "Max : " + programMaxSpeed(program).toFixed(1) + " km/h";
    previewDuration.textContent = "Durée : " + formatClock(programDuration(program));
}

function openProgramModal() {
    selectProgram(selectedProgram);
    programModalHint.hidden = connected;
    programLaunchBtn.disabled = !connected;
    programModal.showModal();
}

function closeProgramModal() {
    programModal.close();
}

// --- Program Logic ---
function startProgram() {
    if (!connected) {
        showToast("Connectez d'abord le tapis.");
        return;
    }
    const program = PROGRAMS[selectedProgram];
    activeProgram = { program, elapsed: 0, lastTick: Date.now(), started: false };
    curTargetSpeed = Math.round(clampSpeed(programSpeedAt(program, 0)) * 1000);
    syncSlider();
    if (runningState === 1) {
        send_data(makePacket("set_speed", curTargetSpeed));
    } else {
        startBtn.click(); // countdown + start at the program's first speed
    }
    requestWakeLock();
    renderProgramProfile(programProfile, program);
    updateProgramUI();
}

function stopProgram(message, stopTreadmill) {
    if (!activeProgram) return;
    activeProgram = null;
    if (stopTreadmill && connected) send_data(makePacket("stop"));
    releaseWakeLock();
    updateProgramUI();
    if (message) showToast(message);
}

function programTick() {
    if (!activeProgram) return;
    const now = Date.now();
    const delta = (now - activeProgram.lastTick) / 1000;
    activeProgram.lastTick = now;

    if (!connected) {
        stopProgram("Programme interrompu : tapis déconnecté.", false);
        return;
    }
    // The program clock only advances while the treadmill is running (pause = clock paused)
    if (runningState === 1) {
        activeProgram.started = true;
        activeProgram.elapsed += delta;
    } else if (runningState === 3 && activeProgram.started) {
        stopProgram("Programme arrêté.", false);
        return;
    }

    const program = activeProgram.program;
    if (activeProgram.elapsed >= programDuration(program)) {
        stopProgram("Programme terminé, bravo !", true);
        return;
    }
    // Don't overwrite a command still waiting to be sent (e.g. a pause requested by the user)
    if (runningState === 1 && !pendingData) {
        const target = Math.round(clampSpeed(programSpeedAt(program, activeProgram.elapsed)) * 1000);
        if (target !== curTargetSpeed) {
            curTargetSpeed = target;
            syncSlider();
            send_data(makePacket("set_speed", target));
        }
    }
    updateProgramUI();
}

// --- UI Event Handlers ---
programBtn.addEventListener('click', () => {
    if (activeProgram) stopProgram("Programme arrêté.", true);
    else openProgramModal();
});

programLaunchBtn.addEventListener('click', () => {
    closeProgramModal();
    startProgram();
});
programCancelBtn.addEventListener('click', closeProgramModal);
programModalClose.addEventListener('click', closeProgramModal);
// Tap outside the modal content closes it
programModal.addEventListener('click', (e) => {
    if (e.target === programModal) closeProgramModal();
});

// The treadmill's stop button also ends the program
stopBtn.addEventListener('click', () => {
    stopProgram("Programme arrêté.", false);
});

// --- Initialize ---
PROGRAMS.forEach((program, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'program-item';
    item.setAttribute('role', 'radio');
    item.innerHTML = '<span class="program-item-head"><span class="program-item-name"></span><span class="program-item-level"></span></span>' +
        '<span class="program-item-meta"></span><span class="program-item-desc"></span>';
    item.querySelector('.program-item-name').textContent = program.name;
    const level = item.querySelector('.program-item-level');
    level.textContent = '●'.repeat(program.level) + '○'.repeat(MAX_LEVEL - program.level);
    level.setAttribute('aria-label', 'Difficulté ' + program.level + ' sur ' + MAX_LEVEL);
    item.querySelector('.program-item-meta').textContent =
        Math.round(programDuration(program) / 60) + ' min · max ' + programMaxSpeed(program).toFixed(1) + ' km/h';
    item.querySelector('.program-item-desc').textContent = program.description || '';
    item.addEventListener('click', () => selectProgram(i));
    programList.appendChild(item);
});
setInterval(programTick, 1000);
updateProgramUI();
