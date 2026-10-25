// treadmill.js - JavaScript logic for PitPat Treadmill Control Dashboard

// --- Bluetooth UUIDs ---
const SERVICE_UUID = "0000fba0-0000-1000-8000-00805f9b34fb";
const NOTIFY_CHAR_UUID = "0000fba2-0000-1000-8000-00805f9b34fb";
const WRITE_CHAR_UUID = "0000fba1-0000-1000-8000-00805f9b34fb";

// --- UI Elements ---
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
const speedDiv = document.getElementById('speed');
const speedUnitSpan = document.getElementById('speedUnit');
const distanceDiv = document.getElementById('distance');
const caloriesDiv = document.getElementById('calories');
const stepsDiv = document.getElementById('steps');
const durationDiv = document.getElementById('duration');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const speedUpBtn = document.getElementById('speedUpBtn');
const speedDownBtn = document.getElementById('speedDownBtn');
const speedSlider = document.getElementById('speedSlider');
const sliderValue = document.getElementById('sliderValue');
const statusChip = document.getElementById('statusChip');
const loadingOverlay = document.getElementById('loadingOverlay');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNumber = document.getElementById('countdownNumber');
const historyTableBody = document.getElementById('historyTableBody');
const importHistoryBtn = document.getElementById('importHistoryBtn');
const exportHistoryBtn = document.getElementById('exportHistoryBtn');
const importHistoryInput = document.getElementById('importHistoryInput');
const snackbar = document.getElementById('snackbar');

// --- Session History Logic ---
let sessionActive = false;
let sessionStartData = null;
let lastSession = null;

function loadSessions() {
    let sessions = [];
    try {
        sessions = JSON.parse(localStorage.getItem('treadmill_sessions') || '[]');
    } catch {}
    return Array.isArray(sessions) ? sessions : [];
}
function saveSessions(sessions) {
    localStorage.setItem('treadmill_sessions', JSON.stringify(sessions));
}
function addSession(session) {
    const sessions = loadSessions();
    sessions.unshift(session); // newest first
    saveSessions(sessions);
    renderSessionTable();
}
function deleteSession(idx) {
    const sessions = loadSessions();
    sessions.splice(idx, 1);
    saveSessions(sessions);
    renderSessionTable();
}
function renderSessionTable() {
    const sessions = loadSessions();
    historyTableBody.innerHTML = '';
    sessions.forEach((s, i) => {
        let avgSpeedDisplay = '-';
        if (typeof s.avgSpeed === 'number' && !isNaN(s.avgSpeed)) {
            avgSpeedDisplay = s.avgSpeed.toFixed(2) + ' ' + (s.speedUnit || '');
        } else if (typeof s.avgSpeed === 'string' && !isNaN(parseFloat(s.avgSpeed))) {
            avgSpeedDisplay = parseFloat(s.avgSpeed).toFixed(2) + ' ' + (s.speedUnit || '');
        }
        let dateStr = '-';
        if (typeof s.date === 'number' || typeof s.date === 'string') {
            dateStr = dateFns.formatRelative(new Date(s.date), new Date());
        }
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${formatDuration(s.duration)}</td>
            <td>${s.steps}</td>
            <td>${s.calories}</td>
            <td>${avgSpeedDisplay}</td>
            <td><button class="mdl-button mdl-js-button mdl-button--icon" title="Delete" onclick="window.deleteSessionFromTable(${i})"><i class="material-icons">delete</i></button></td>
        `;
        historyTableBody.appendChild(tr);
    });
}
window.deleteSessionFromTable = deleteSession;

// --- State ---
let device = null;
let server = null;
let notifyChar = null;
let writeChar = null;
let treadmillData = {};
let connected = false;
let runningState = 3; // 0: Starting, 1: Running, 2: Paused, 3: Stopped
let curTargetSpeed = 1000; // in treadmill units

// --- Helper Functions ---

// Treadmill status badge: the icon and colour come from the CSS, via data-state
const STATUS_LABELS = {
    Disconnected: 'Déconnecté',
    Connecting: 'Connexion…',
    Stopped: 'Arrêté',
    Starting: 'Démarrage…',
    Running: 'En marche',
    Paused: 'En pause'
};
function setStatus(state) {
    if (!STATUS_LABELS[state]) state = 'Disconnected';
    if (statusChip) {
        statusChip.dataset.state = state.toLowerCase();
        statusChip.querySelector('.status-text').textContent = STATUS_LABELS[state];
    }
}

// Bluetooth button: 'disconnected' | 'connecting' | 'connected'
const CONNECT_BUTTON = {
    disconnected: { icon: 'bluetooth_disabled', label: 'Connecter' },
    connecting: { icon: 'bluetooth_searching', label: 'Connexion…' },
    connected: { icon: 'bluetooth_connected', label: 'Déconnecter' }
};
function setConnectButton(state) {
    connectBtn.dataset.state = state;
    connectBtn.disabled = state === 'connecting';
    connectBtn.querySelector('.material-icons').textContent = CONNECT_BUTTON[state].icon;
    connectBtn.querySelector('.connect-label').textContent = CONNECT_BUTTON[state].label;
}
function updateDashboard(data) {
    // data.speed is "3.50 km/h": the number and the unit are shown separately
    const [speedValue, speedUnit] = (data.speed || '-').split(' ');
    speedDiv.textContent = speedValue;
    if (speedUnit) speedUnitSpan.textContent = speedUnit;
    distanceDiv.textContent = data.distance || '-';
    caloriesDiv.textContent = data.calories || '-';
    stepsDiv.textContent = (data.steps !== undefined && data.steps !== null) ? data.steps : '-';
    if (data.duration && typeof data.duration === 'number') {
        durationDiv.textContent = formatDuration(data.duration);
    } else if (typeof data.duration === 'string' && !isNaN(parseFloat(data.duration))) {
        durationDiv.textContent = formatDuration(parseFloat(data.duration));
    } else {
        durationDiv.textContent = data.duration || '-';
    }
}
function enableControls(enable) {
    startBtn.disabled = !enable;
    stopBtn.disabled = !enable;
    speedUpBtn.disabled = !enable;
    speedDownBtn.disabled = !enable;
    speedSlider.disabled = !enable;
}
// Main button: Démarrer -> Démarrage… -> Pause -> Reprendre.
// The Stop button is only shown while a session is in progress.
const START_BUTTON = {
    start: { icon: 'play_arrow', label: 'DÉMARRER' },
    starting: { icon: 'hourglass_empty', label: 'DÉMARRAGE…' },
    pause: { icon: 'pause', label: 'PAUSE' },
    resume: { icon: 'play_arrow', label: 'REPRENDRE' }
};
function setStartButton(action) {
    startBtn.dataset.action = action;
    startBtn.querySelector('.material-icons').textContent = START_BUTTON[action].icon;
    startBtn.querySelector('.ctrl-label').textContent = START_BUTTON[action].label;
}
function showStopButton(show) {
    stopBtn.hidden = !show;
    stopBtn.disabled = !show;
}
function updateRunningState(state) {
    runningState = state;
    if (!connected) {
        enableControls(false);
        setStartButton('start');
        showStopButton(false);
        setStatus('Disconnected');
    } else {
        switch (state) {
            case 0: // Starting
                enableControls(false);
                setStartButton('starting');
                showStopButton(true);
                setStatus('Starting');
                break;
            case 1: // Running
                enableControls(true);
                setStartButton('pause');
                showStopButton(true);
                setStatus('Running');
                break;
            case 2: // Paused
                enableControls(true);
                setStartButton('resume');
                showStopButton(true);
                setStatus('Paused');
                break;
            case 3: // Stopped
                enableControls(true);
                setStartButton('start');
                showStopButton(false);
                setStatus('Stopped');
                break;
            default:
                enableControls(false);
                setStartButton('start');
                showStopButton(false);
                setStatus('Disconnected');
        }
    }
}
function formatDuration(seconds) {
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    let parts = [];
    if (h > 0) parts.push(h + 'h');
    if (m > 0 || h > 0) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
}

// --- Send Data Logic (replaces sendCommand) ---
let pendingData = null;
function send_data(packet) {
    pendingData = packet;
}

// --- Bluetooth Logic ---
function bluetoothErrorMessage(err) {
    switch (err && err.name) {
        case 'NotFoundError':
            return "Aucun tapis sélectionné. Vérifiez que le tapis est allumé, et que le Bluetooth et la localisation du téléphone sont activés.";
        case 'SecurityError':
        case 'NotAllowedError':
            return "Bluetooth refusé pour ce site : autorisez-le dans Chrome (⋮ → Paramètres → Paramètres des sites → Bluetooth).";
        case 'NetworkError':
            return "Connexion au tapis impossible. Rapprochez-vous du tapis et réessayez.";
        default:
            return "Erreur Bluetooth : " + ((err && err.message) || err);
    }
}

async function connectBluetooth() {
    if (!navigator.bluetooth) {
        showToast("Bluetooth web indisponible dans ce navigateur : ouvrez l'application dans Chrome.", 8000);
        return;
    }
    setStatus('Connecting');
    setConnectButton('connecting');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
        console.log("Requesting Bluetooth device...");
        device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [SERVICE_UUID] }],
            services: [SERVICE_UUID]
        });
        console.log("Device selected:", device);
        setStatus('Connecting');
        device.addEventListener('gattserverdisconnected', onDisconnected);
        server = await device.gatt.connect();
        console.log("GATT server connected:", server);
        let services = await server.getPrimaryServices();
        console.log("Primary services:", services.map(s => s.uuid));
        notifyChar = await server.getPrimaryService(SERVICE_UUID).then(
            service => service.getCharacteristic(NOTIFY_CHAR_UUID)
        ).catch(async () => {
            // fallback: try to find the service by iterating
            let services = await server.getPrimaryServices();
            for (let s of services) {
                try {
                    let c = await s.getCharacteristic(NOTIFY_CHAR_UUID);
                    if (c) return c;
                } catch {}
            }
            throw new Error("Notify characteristic not found");
        });
        console.log("Notify characteristic:", notifyChar);
        writeChar = await server.getPrimaryService(SERVICE_UUID).then(
            service => service.getCharacteristic(WRITE_CHAR_UUID)
        ).catch(async () => {
            let services = await server.getPrimaryServices();
            for (let s of services) {
                try {
                    let c = await s.getCharacteristic(WRITE_CHAR_UUID);
                    if (c) return c;
                } catch {}
            }
            throw new Error("Write characteristic not found");
        });
        console.log("Write characteristic:", writeChar);
        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', handleNotification);
        connected = true;
        setStatus('Stopped');
        setConnectButton('connected');
        updateRunningState(3);
        // No heartbeat loop, just send heartbeat or data on notification
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    } catch (err) {
        console.error("Bluetooth connection error:", err);
        showToast(bluetoothErrorMessage(err), 8000);
        setStatus('Disconnected');
        connected = false;
        setConnectButton('disconnected');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        // stopHeartbeatLoop();
    }
}

function disconnectBluetooth() {
    if (device && device.gatt.connected) {
        device.gatt.disconnect();
    }
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    setStatus('Disconnected');
}

function onDisconnected() {
    connected = false;
    setStatus('Disconnected');
    setConnectButton('disconnected');
    updateRunningState(3);
    if (sessionActive && sessionStartData) {
        finishSession('Disconnected');
    }
}

// --- Debug panel: tap the version label 5 times to show the raw treadmill data ---
// Bytes that changed since the previous message are highlighted, to spot the counters.
const debugPanel = document.getElementById('debugPanel');
let debugTaps = [];
let lastDebugBytes = null;
document.getElementById('appVersion').addEventListener('click', () => {
    const now = Date.now();
    debugTaps = debugTaps.filter((t) => now - t < 2000).concat(now);
    if (debugTaps.length >= 5) {
        debugTaps = [];
        debugPanel.hidden = !debugPanel.hidden;
    }
});
function renderDebug(bytes, decoded) {
    if (!debugPanel.hidden) {
        let rows = '';
        bytes.forEach((b, i) => {
            if (i % 8 === 0) rows += (i ? '\n' : '') + String(i).padStart(2, '0') + ': ';
            const hex = b.toString(16).padStart(2, '0');
            rows += (lastDebugBytes && lastDebugBytes[i] !== b ? '<b>' + hex + '</b>' : hex) + ' ';
        });
        debugPanel.innerHTML = '<strong>Données du tapis (' + bytes.length + ' octets)</strong>\n' + rows + '\n\n' + decoded;
    }
    lastDebugBytes = bytes;
}

function handleNotification(event) {
    const value = event.target.value;
    // Logging for debugging
    console.log("Received notification, byteLength:", value.byteLength);
    let hexStr = [];
    for (let i = 0; i < value.byteLength; ++i) {
        hexStr.push(value.getUint8(i).toString(16).padStart(2, "0"));
    }
    console.log("Payload (hex):", hexStr.join(" "));
    const bytes = Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    // Parse treadmill data from value (see treadmill_data.py for structure)
    if (value.byteLength < 31) {
        renderDebug(bytes, "Message trop court : ignoré");
        treadmillData = {
            speed: "-",
            distance: "-",
            calories: "-",
            steps: "-",
            duration: "-",
            status: "Invalid"
        };
        updateDashboard(treadmillData);
        updateRunningState(3);
        // If session was active, save it as ended due to disconnect/invalid
        if (sessionActive && sessionStartData) {
            finishSession('Disconnected');
        }
        return;
    }
    // Helper to read unsigned int from bytes
    function u16(offset) {
        return (value.getUint8(offset) << 8) | value.getUint8(offset + 1);
    }
    function u32(offset) {
        return (value.getUint8(offset) << 24) | (value.getUint8(offset + 1) << 16) | (value.getUint8(offset + 2) << 8) | value.getUint8(offset + 3);
    }
    // Parse fields
    const current_speed = u16(3);
    const distance = u32(7);
    const calories = (value.getUint8(18) << 8) | value.getUint8(19);
    // Steps: bytes 43-44 on the 50-byte messages (bytes 14-17 always stay at 0 on this model)
    const steps = value.byteLength >= 45 ? u16(43) : u32(14);
    const duration = u32(20);
    const flags = value.getUint8(26);
    const unit_mode = (flags & 128) === 128 ? 1 : 0;
    const running_state_bits = flags & 24;
    let running_state = 3;
    if (running_state_bits === 24) running_state = 0;
    else if (running_state_bits === 8) running_state = 1;
    else if (running_state_bits === 16) running_state = 2;
    else running_state = 3;
    const statusArr = ["Starting", "Running", "Paused", "Stopped"];
    const speed_unit = unit_mode === 1 ? "mph" : "km/h";
    const distance_unit = unit_mode === 1 ? "mi" : "km";
    treadmillData = {
        speed: (current_speed / 1000).toFixed(2) + " " + speed_unit,
        distance: (distance / 1000).toFixed(2) + " " + distance_unit,
        calories: calories + " kcal",
        steps: steps,
        duration: Math.round(duration / 1000),
        status: statusArr[running_state] || "Unknown",
        _raw: { current_speed, distance, calories, steps, duration, speed_unit }
    };
    // Log parsed fields
    console.log("Parsed treadmill data:", treadmillData);
    renderDebug(bytes,
        "vitesse [3-4]     = " + current_speed + "\n" +
        "distance [7-10]   = " + distance + "\n" +
        "pas [" + (value.byteLength >= 45 ? "43-44" : "14-17") + "]       = " + steps + "\n" +
        "calories [18-19]  = " + calories + "\n" +
        "durée [20-23]     = " + duration + "\n" +
        "état [26]         = 0x" + flags.toString(16).padStart(2, "0"));
    updateDashboard(treadmillData);
    updateRunningState(running_state);

    // --- Session tracking logic ---
    if (running_state === 1 && !sessionActive) {
        // Session started
        sessionActive = true;
        sessionStartData = {
            date: Date.now(),
            steps: steps,
            calories: calories,
            distance: distance,
            duration: Math.round(duration / 1000),
            speedSum: current_speed,
            speedCount: 1,
            speedUnit: speed_unit
        };
        // Save as first session
        const avgSpeed = (sessionStartData.speedSum / sessionStartData.speedCount) / 1000;
        upsertLiveSession({
            date: sessionStartData.date,
            duration: sessionStartData.duration,
            steps: sessionStartData.steps,
            calories: sessionStartData.calories + ' kcal',
            avgSpeed: avgSpeed,
            speedUnit: sessionStartData.speedUnit || ''
        });
    } else if (running_state === 1 && sessionActive && sessionStartData) {
        // Update session stats
        sessionStartData.steps = steps;
        sessionStartData.calories = calories;
        sessionStartData.distance = distance;
        sessionStartData.duration = Math.round(duration / 1000);
        sessionStartData.speedSum += current_speed;
        sessionStartData.speedCount += 1;
        // Update first session in treadmill_sessions
        const avgSpeed = (sessionStartData.speedSum / sessionStartData.speedCount) / 1000;
        upsertLiveSession({
            date: sessionStartData.date,
            duration: sessionStartData.duration,
            steps: sessionStartData.steps,
            calories: sessionStartData.calories + ' kcal',
            avgSpeed: avgSpeed,
            speedUnit: sessionStartData.speedUnit || ''
        });
    } else if ((running_state === 3 || running_state === 2) && sessionActive && sessionStartData) {
        // Session ended (Stopped or Paused)
        finishSession(running_state === 3 ? 'Stopped' : 'Paused');
    }

    // --- Heartbeat/data send logic, like _notification_handler ---
    if (writeChar) {
        if (pendingData) {
            console.log("Sending pending data packet:", Array.from(pendingData).map(b => b.toString(16).padStart(2, "0")).join(" "));
            writeChar.writeValue(pendingData).then(() => {
                console.log("Pending data sent.");
                pendingData = null;
            }).catch(err => {
                console.error("Failed to send pending data:", err);
            });
        } else {
            // Heartbeat packet: 6a05fdf843
            const heartbeat = new Uint8Array([0x6a, 0x05, 0xfd, 0xf8, 0x43]);
            console.log("Sending heartbeat packet:", Array.from(heartbeat).map(b => b.toString(16).padStart(2, "0")).join(" "));
            writeChar.writeValue(heartbeat).catch(err => {
                console.error("Failed to send heartbeat:", err);
            });
        }
    }
}

async function sendCommand(packet) {
    if (!writeChar) return;
    try {
        console.log("Sending command packet:", Array.from(packet).map(b => b.toString(16).padStart(2, "0")).join(" "));
        await writeChar.writeValue(packet);
    } catch (err) {
        console.error("Failed to send command:", err);
        showToast("Échec de l'envoi de la commande : " + err);
    }
}

// --- Command Packet Generators (see treadmill_controller.py) ---
/**
 * Constructs a treadmill command packet.
 * @param {string} type - Command type: "start", "pause", "stop", or "set_speed".
 * @param {number} [speed=1000] - Target speed in treadmill units (integer, 1000 = 1.00 kph, range: 1000 to 6000).
 * @returns {Uint8Array} The command packet.
 */
function makePacket(type, speed = 1000) {
    // type: "start", "pause", "stop", "set_speed"
    // Implements the protocol from treadmill_controller.py
    let arr = new Uint8Array(23);
    arr[0] = 0x6A; // START_BYTE
    arr[1] = 0x17; // LENGTH
    // arr[2-5] = 0 (reserved)
    arr[6] = (speed >> 8) & 0xFF;
    arr[7] = speed & 0xFF;
    arr[8] = type === "set_speed" ? 5 : 1; // magical_i11: 5 for set_speed, 1 for others
    arr[9] = 0; // incline
    arr[10] = 80; // weight (default)
    arr[11] = 0; // reserved
    // Command byte (kph): 4=start/set, 2=pause, 0=stop
    let cmd = type === "pause" ? 2 : type === "stop" ? 0 : 4;
    arr[12] = cmd & 0xF7; // kph mode (bit 3 = 0)
    // User ID (8 bytes, default 58965456623)
    let userId = 58965456623n;
    for (let i = 0; i < 8; ++i) {
        arr[13 + i] = Number((userId >> BigInt(56 - i * 8)) & 0xFFn);
    }
    // Checksum: XOR of bytes 1 to 20
    let checksum = 0;
    for (let i = 1; i <= 20; ++i) {
        checksum ^= arr[i];
    }
    arr[21] = checksum;
    arr[22] = 0x43; // END_BYTE
    return arr;
}

// --- UI Event Handlers ---
connectBtn.addEventListener('click', () => {
    if (!connected) connectBluetooth();
    else disconnectBluetooth();
});

startBtn.addEventListener('click', async () => {
    if (!connected) return;
    if (runningState === 1) { // Running -> Pause
        send_data(makePacket("pause"));
    } else { // Start
        // Show countdown overlay (visual only, do not delay command)
        if (countdownOverlay && countdownNumber) {
            countdownOverlay.style.display = 'flex';
            countdownOverlay.style.opacity = '1';
            let count = 3;
            countdownNumber.textContent = count;
            countdownNumber.style.opacity = '1';
            countdownNumber.style.transform = 'scale(1)';
            // Animate countdown in background
            (async () => {
                for (let i = 0; i < 3; i++) {
                    await new Promise(res => setTimeout(res, 700));
                    countdownNumber.style.transform = 'scale(1.3)';
                    countdownNumber.style.opacity = '0.5';
                    await new Promise(res => setTimeout(res, 200));
                    count--;
                    if (count > 0) {
                        countdownNumber.textContent = count;
                        countdownNumber.style.opacity = '1';
                        countdownNumber.style.transform = 'scale(1)';
                    }
                }
                await new Promise(res => setTimeout(res, 400));
                countdownOverlay.style.opacity = '0';
                await new Promise(res => setTimeout(res, 500)); // Wait for fade-out
                countdownOverlay.style.display = 'none';
                countdownOverlay.style.opacity = '1'; // Reset for next time
            })();
        }
        send_data(makePacket("start", curTargetSpeed));
    }
});

stopBtn.addEventListener('click', () => {
    if (!connected) return;
    send_data(makePacket("stop"));
});

// Keep the slider in sync with the target speed set by the +/- buttons
function syncSlider() {
    const kph = (curTargetSpeed / 1000).toFixed(1);
    if (speedSlider.MaterialSlider) {
        speedSlider.MaterialSlider.change(kph);
    } else {
        speedSlider.value = kph;
    }
    sliderValue.textContent = kph;
}

speedUpBtn.addEventListener('click', () => {
    if (!connected) return;
    curTargetSpeed = Math.min(curTargetSpeed + 100, 6000);
    syncSlider();
    send_data(makePacket("set_speed", curTargetSpeed));
});

speedDownBtn.addEventListener('click', () => {
    if (!connected) return;
    curTargetSpeed = Math.max(curTargetSpeed - 100, 1000);
    syncSlider();
    send_data(makePacket("set_speed", curTargetSpeed));
});

speedSlider.addEventListener('input', () => {
    sliderValue.textContent = parseFloat(speedSlider.value).toFixed(1);
});
speedSlider.addEventListener('change', () => {
    if (!connected) return;
    curTargetSpeed = Math.round(parseFloat(speedSlider.value) * 1000);
    send_data(makePacket("set_speed", curTargetSpeed));
});

// --- Initialize ---
updateDashboard({});
setConnectButton('disconnected');
updateRunningState(3);
sliderValue.textContent = parseFloat(speedSlider.value).toFixed(1);
renderSessionTable();

function saveCurrentSession(session) {
    localStorage.setItem('treadmill_current_session', JSON.stringify(session));
}
function loadCurrentSession() {
    try {
        return JSON.parse(localStorage.getItem('treadmill_current_session')) || null;
    } catch { return null; }
}
function clearCurrentSession() {
    localStorage.removeItem('treadmill_current_session');
}

function upsertLiveSession(session) {
    let sessions = loadSessions();
    if (sessions.length > 0 && sessions[0] && sessions[0].date === session.date) {
        sessions[0] = session;
    } else {
        sessions.unshift(session);
    }
    saveSessions(sessions);
    renderSessionTable();
}

function finishSession(reason) {
    sessionActive = false;
    sessionStartData = null;
    // No need to do anything else, as the session is already up-to-date in treadmill_sessions
}

// On page load, check for an unfinished session and restore it if present
const restored = loadCurrentSession();
if (restored && !sessionActive) {
    sessionActive = true;
    sessionStartData = restored;
}

// --- Import/Export History ---
if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', () => {
        const sessions = loadSessions();
        const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'treadmill_sessions.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        showToast('History exported.');
    });
}

if (importHistoryBtn && importHistoryInput) {
    importHistoryBtn.addEventListener('click', () => {
        importHistoryInput.value = '';
        importHistoryInput.click();
    });
    importHistoryInput.addEventListener('change', (e) => {
        const file = importHistoryInput.files && importHistoryInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    saveSessions(imported);
                    renderSessionTable();
                    showToast('History imported successfully.');
                } else {
                    showToast('Invalid file format.');
                }
            } catch (err) {
                showToast('Failed to import: ' + err);
            }
        };
        reader.readAsText(file);
    });
}

function showToast(message, timeout = 4000) {
    if (snackbar && snackbar.MaterialSnackbar) {
        snackbar.MaterialSnackbar.showSnackbar({ message, timeout });
    } else if (snackbar) {
        // fallback for late upgrade
        snackbar.querySelector('.mdl-snackbar__text').textContent = message;
        snackbar.classList.add('mdl-snackbar--active');
        setTimeout(() => snackbar.classList.remove('mdl-snackbar--active'), timeout);
    } else {
        alert(message); // fallback
    }
}
