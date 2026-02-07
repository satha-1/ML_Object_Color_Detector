// Paste your Teachable Machine model link here (must end with a slash)
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/BcJk2MJwz/";

// Confidence threshold
const THRESHOLD = 0.60;

// Beep cooldown (ms) to avoid spamming
const BEEP_COOLDOWN_MS = 1000;

// Voice announcement cooldown (ms) — only re-speaks if the color changes or after this time
const VOICE_COOLDOWN_MS = 2500;

let model, webcam, maxPredictions;
let isRunning = false;
let lastBeepAt = 0;
let lastSpokenColor = "";
let lastSpokeAt = 0;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const webcamContainer = document.getElementById("webcamContainer");
const statusEl = document.getElementById("status");
const topLabelEl = document.getElementById("topLabel");
const topConfEl = document.getElementById("topConf");
const probListEl = document.getElementById("probList");

startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

function setStatus(msg) { statusEl.textContent = msg; }

function ensureModelUrlValid() {
  return MODEL_URL && !MODEL_URL.includes("PASTE_YOUR");
}

function setTheme(label) {
  document.body.classList.remove("theme-red", "theme-blue", "theme-green", "theme-neutral");
  if (label === "Red") document.body.classList.add("theme-red");
  else if (label === "Blue") document.body.classList.add("theme-blue");
  else if (label === "Green") document.body.classList.add("theme-green");
  else document.body.classList.add("theme-neutral");
}

function beep() {
  const now = Date.now();
  if (now - lastBeepAt < BEEP_COOLDOWN_MS) return;
  lastBeepAt = now;

  // Web Audio API short beep
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = 880; // A5 beep
  gain.gain.value = 0.05;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  setTimeout(() => {
    osc.stop();
    ctx.close();
  }, 120);
}

function speakColor(colorName) {
  const now = Date.now();
  // Only speak if the color changed OR enough time has passed
  if (colorName === lastSpokenColor && now - lastSpokeAt < VOICE_COOLDOWN_MS) return;

  // Cancel any ongoing speech to avoid queuing
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(colorName);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  window.speechSynthesis.speak(utterance);
  lastSpokenColor = colorName;
  lastSpokeAt = now;
}

async function start() {
  try {
    if (!ensureModelUrlValid()) {
      alert("Paste your Teachable Machine model URL into MODEL_URL in app.js (make sure it ends with /).");
      return;
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus("Loading model…");

    const modelURL = MODEL_URL + "model.json";
    const metadataURL = MODEL_URL + "metadata.json";
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();

    setStatus("Starting camera…");
    const flip = true;
    webcam = new tmImage.Webcam(640, 480, flip);
    await webcam.setup();
    await webcam.play();

    isRunning = true;
    webcamContainer.innerHTML = "";
    webcamContainer.appendChild(webcam.canvas);

    buildProbabilityUI();
    setTheme("neutral");
    setStatus("Running. Show something Red, Blue, or Green.");

    window.requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    setTheme("neutral");
    setStatus("Could not start. Check permissions and MODEL_URL.");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    alert("If you opened the file directly, try a local server (python -m http.server).");
  }
}

async function stop() {
  isRunning = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;

  if (webcam) await webcam.stop();
  window.speechSynthesis.cancel();   // stop any ongoing voice
  lastSpokenColor = "";
  webcamContainer.innerHTML = "";
  probListEl.innerHTML = "";
  topLabelEl.textContent = "—";
  topConfEl.textContent = "—";
  setTheme("neutral");
  setStatus("Camera is off");
}

async function loop() {
  if (!isRunning) return;
  webcam.update();
  await predict();
  window.requestAnimationFrame(loop);
}

function buildProbabilityUI() {
  probListEl.innerHTML = "";
  for (let i = 0; i < maxPredictions; i++) {
    const row = document.createElement("div");
    row.className = "prob-row";

    const header = document.createElement("div");
    header.className = "prob-row-header";

    const name = document.createElement("span");
    name.className = "prob-name";
    name.textContent = "Class " + (i + 1);

    const pct = document.createElement("span");
    pct.className = "prob-pct";
    pct.textContent = "0%";

    header.appendChild(name);
    header.appendChild(pct);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "fill";
    bar.appendChild(fill);

    row.appendChild(header);
    row.appendChild(bar);
    probListEl.appendChild(row);
  }
}

const colorSwatchEl = document.getElementById("colorSwatch");

const COLOR_MAP = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
  yellow: "#eab308", orange: "#f97316", purple: "#a855f7",
  pink: "#ec4899", white: "#f8fafc", black: "#1e293b"
};

function getSwatchColor(label) {
  const key = label.toLowerCase();
  return COLOR_MAP[key] || "transparent";
}

async function predict() {
  const prediction = await model.predict(webcam.canvas);

  const sorted = [...prediction].sort((a, b) => b.probability - a.probability);
  const top = sorted[0];

  // Update probabilities list
  const rows = probListEl.querySelectorAll(".prob-row");
  prediction.forEach((p, i) => {
    const row = rows[i];
    if (!row) return;
    const name = row.querySelector(".prob-name");
    const fill = row.querySelector(".fill");
    const pct = row.querySelector(".prob-pct");

    name.textContent = p.className;
    const percent = Math.round(p.probability * 100);
    fill.style.width = percent + "%";
    pct.textContent = percent + "%";

    // Highlight the top prediction row
    if (p.className === top.className) {
      row.classList.add("top-prediction");
    } else {
      row.classList.remove("top-prediction");
    }
  });

  // Not sure rule
  if (top.probability < THRESHOLD) {
    topLabelEl.textContent = "Not sure";
    topConfEl.textContent = "Try again";
    colorSwatchEl.style.background = "transparent";
    lastSpokenColor = "";          // reset so next confident color is spoken immediately
    setTheme("neutral");
    return;
  }

  // Confident prediction
  topLabelEl.textContent = top.className;
  topConfEl.textContent = Math.round(top.probability * 100) + "%";
  colorSwatchEl.style.background = getSwatchColor(top.className);

  // Change background, beep, and announce color
  setTheme(top.className);
  beep();
  speakColor(top.className);
}
