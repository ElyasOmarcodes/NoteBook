/* ==========================================================
   Smart Studio - Frontend Logic
   د UI منطق او د SocketIO ریښتیني-وخت اړیکه
   ========================================================== */

const socket = io();

// ---------- د عناصرو شارټ کټونه ----------
const $ = (id) => document.getElementById(id);

const connBadge   = $("connBadge");
const inputDevice = $("inputDevice");
const outputDevice= $("outputDevice");
const refreshBtn  = $("refreshBtn");

const fileInput   = $("fileInput");
const uploadBtn   = $("uploadBtn");
const trackName   = $("trackName");
const playBtn     = $("playBtn");
const pauseBtn    = $("pauseBtn");
const stopBtn     = $("stopBtn");
const masterVol   = $("masterVol");

const autoBtn     = $("autoModeBtn");
const manualBtn   = $("manualModeBtn");

const vuBar       = $("vuBar");
const vuThreshold = $("vuThreshold");
const duckState   = $("duckState");
const gainValue   = $("gainValue");
const playState   = $("playState");

// ---------- مرستندویه ----------
function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function postJSON(url, body) {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });
    return res.json();
}

// ==========================================================
//  د تنظیماتو لیږل (debounced)
// ==========================================================
function gatherSettings() {
    return {
        threshold:    (+$("threshold").value) / 100,
        min_vol:      (+$("minVol").value) / 100,
        max_vol:      (+$("maxVol").value) / 100,
        fade_down_ms: +$("fadeDown").value,
        fade_up_ms:   +$("fadeUp").value,
        hold_time:    (+$("holdTime").value) / 1000,
        master_volume:(+masterVol.value) / 100,
    };
}

const sendSettings = debounce(() => {
    postJSON("/api/settings", gatherSettings());
}, 150);

// ---------- د سلایډرونو لیبلونه تازه کول ----------
function bindSlider(id, valId, fmt) {
    const el = $(id), lbl = $(valId);
    el.addEventListener("input", () => {
        lbl.textContent = fmt(el.value);
        if (id === "threshold") {
            vuThreshold.style.right = el.value + "%";
        }
        sendSettings();
    });
}

bindSlider("threshold", "thresholdVal", v => (v / 100).toFixed(2));
bindSlider("minVol",    "minVolVal",    v => v + "%");
bindSlider("maxVol",    "maxVolVal",    v => v + "%");
bindSlider("fadeDown",  "fadeDownVal",  v => v + "ms");
bindSlider("fadeUp",    "fadeUpVal",    v => v + "ms");
bindSlider("holdTime",  "holdTimeVal",  v => (v / 1000).toFixed(1) + "s");
bindSlider("masterVol", "masterVolVal", v => v + "%");

// د threshold لیکه په پیل کې ځای پر ځای کول
vuThreshold.style.right = $("threshold").value + "%";

// ==========================================================
//  د حالت (Mode) بدلول
// ==========================================================
function setMode(mode) {
    autoBtn.classList.toggle("active", mode === "auto");
    manualBtn.classList.toggle("active", mode === "manual");
    postJSON("/api/settings", { mode: mode, ...gatherSettings() });
}
autoBtn.addEventListener("click", () => setMode("auto"));
manualBtn.addEventListener("click", () => setMode("manual"));

// ==========================================================
//  د وسایلو پیژندنه (Devices)
// ==========================================================
async function loadDevices() {
    refreshBtn.textContent = "⏳ په لټون کې…";
    try {
        const res = await fetch("/api/devices");
        const data = await res.json();
        fillSelect(inputDevice, data.inputs);
        fillSelect(outputDevice, data.outputs);
    } catch (e) {
        console.error(e);
    }
    refreshBtn.textContent = "🔄 وسایل تازه کړئ";
}

function fillSelect(sel, items) {
    const prev = sel.value;
    sel.innerHTML = '<option value="">— د سیسټم تلواله —</option>';
    (items || []).forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.name;
        sel.appendChild(opt);
    });
    sel.value = prev;
}

refreshBtn.addEventListener("click", loadDevices);
inputDevice.addEventListener("change", () =>
    postJSON("/api/device/input", { device_id: inputDevice.value || null }));
outputDevice.addEventListener("change", () =>
    postJSON("/api/device/output", { device_id: outputDevice.value || null }));

// ==========================================================
//  د فایل اپلوډ
// ==========================================================
uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
    if (!fileInput.files.length) return;
    const fd = new FormData();
    fd.append("file", fileInput.files[0]);
    trackName.textContent = "⏳ په اپلوډ کې…";
    try {
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (data.ok) {
            trackName.textContent = "🎵 " + data.file +
                (data.duration ? "  (" + data.duration + "s)" : "");
        } else {
            trackName.textContent = "⚠️ " + (data.error || "تېروتنه");
        }
    } catch (e) {
        trackName.textContent = "⚠️ د اپلوډ تېروتنه";
    }
});

// ==========================================================
//  د پلیر کنټرولونه
// ==========================================================
playBtn.addEventListener("click", () => postJSON("/api/play"));
pauseBtn.addEventListener("click", () => postJSON("/api/pause"));
stopBtn.addEventListener("click", () => postJSON("/api/stop"));

// ==========================================================
//  SocketIO پیښې
// ==========================================================
socket.on("connect", () => {
    connBadge.textContent = "✅ وصل دی";
    connBadge.className = "status-badge connected";
});
socket.on("disconnect", () => {
    connBadge.textContent = "❌ اړیکه پرې شوه";
    connBadge.className = "status-badge disconnected";
});

// د VU meter ریښتیني-وخت تازه کول
socket.on("vu_level", (d) => {
    const pct = Math.min(100, d.level * 100 * 3); // د لیدلو لپاره مقیاس
    vuBar.style.width = pct + "%";
});

// د عمومي حالت تازه کول
socket.on("state_update", (s) => {
    if (s.ducking) {
        duckState.textContent = "🔉 ښکته (غږ موندل شو)";
        duckState.classList.add("ducking");
    } else {
        duckState.textContent = "🔊 چوپ (بشپړ حجم)";
        duckState.classList.remove("ducking");
    }
    if (s.current_gain != null)
        gainValue.textContent = Math.round(s.current_gain * 100) + "%";

    if (s.playing) playState.textContent = "▶ په غږولو کې";
    else if (s.paused) playState.textContent = "⏸ ودرول شوی";
    else playState.textContent = "⏹ بند دی";

    if (s.loaded_file && trackName.textContent.indexOf("🎵") === -1
        && !trackName.textContent.includes("اپلوډ"))
        trackName.textContent = "🎵 " + s.loaded_file;
});

// ==========================================================
//  پیل
// ==========================================================
loadDevices();
