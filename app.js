// ========== MOTOR DE AUDIO ==========
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Nodos
const masterGain = audioCtx.createGain(); masterGain.gain.value = 0.5;
const filterNode = audioCtx.createBiquadFilter(); filterNode.type = "lowpass";
const distortionNode = audioCtx.createWaveShaper();

const delayNode = audioCtx.createDelay(2.0);
const delayGain = audioCtx.createGain();
delayNode.delayTime.value = 0.3;
delayGain.gain.value = 0;

const convolver = audioCtx.createConvolver();
const reverbGain = audioCtx.createGain();
function createReverbImpulse() {
    const rate = audioCtx.sampleRate, length = rate * 2;
    const impulse = audioCtx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++){
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
    }
    return impulse;
}
convolver.buffer = createReverbImpulse();

// Routing
masterGain.connect(distortionNode);
distortionNode.connect(filterNode);
filterNode.connect(audioCtx.destination);
filterNode.connect(delayNode);
delayNode.connect(delayGain);
delayGain.connect(audioCtx.destination);
delayGain.connect(delayNode);
filterNode.connect(convolver);
convolver.connect(reverbGain);
reverbGain.connect(audioCtx.destination);

function makeDistortionCurve(amount) {
    const k = amount, n_samples = 44100, curve = new Float32Array(n_samples), deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) { const x = (i * 2) / n_samples - 1; curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x)); }
    return curve;
}
document.getElementById('distortionAmount').oninput = (e) => distortionNode.curve = parseInt(e.target.value) === 0 ? null : makeDistortionCurve(parseInt(e.target.value));

const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseData = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBuffer.length; i++) noiseData[i] = Math.random() * 2 - 1;

// Función de Reproducción con Pitch Bend
function playNote(baseFreq) {
    if (baseFreq === 0) return;
    
    // CALCULAR PITCH BEND
    const pbSlider = document.getElementById('pitchBend');
    // Slider 0-1000. Centro 500.
    // Rango: una octava abajo (0.5) a una octava arriba (2.0)
    const pbValue = pbSlider.value / 500; 
    const pitchMultiplier = Math.pow(2, pbValue - 1);
    
    const finalFreq = baseFreq * pitchMultiplier;

    const now = audioCtx.currentTime;
    const atk = parseFloat(document.getElementById('atk').value);
    const dec = parseFloat(document.getElementById('dec').value);
    const sus = parseFloat(document.getElementById('sus').value);
    const rel = parseFloat(document.getElementById('rel').value);

    const tempo = parseInt(document.getElementById('tempo').value);
    const stepDuration = (60.0 / tempo);
    const noteOffTime = now + stepDuration * 0.9;

    const env = audioCtx.createGain();
    env.connect(masterGain);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(1, now + atk);
    env.gain.linearRampToValueAtTime(sus, now + atk + dec);
    env.gain.setValueAtTime(sus, noteOffTime);
    env.gain.linearRampToValueAtTime(0, noteOffTime + rel);

    const sq = audioCtx.createOscillator(); sq.type = 'square'; sq.frequency.value = finalFreq;
    const saw = audioCtx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = finalFreq;
    const tri = audioCtx.createOscillator(); tri.type = 'triangle'; tri.frequency.value = finalFreq;
    const sin = audioCtx.createOscillator(); sin.type = 'sine'; sin.frequency.value = finalFreq;
    
    const mixSq = audioCtx.createGain(); mixSq.gain.value = document.getElementById('mixSq').value;
    const mixSaw = audioCtx.createGain(); mixSaw.gain.value = document.getElementById('mixSaw').value;
    const mixTri = audioCtx.createGain(); mixTri.gain.value = document.getElementById('mixTri').value;
    const mixSin = audioCtx.createGain(); mixSin.gain.value = document.getElementById('mixSin').value * 1.5; // Boost senoidal

    sq.connect(mixSq).connect(env);
    saw.connect(mixSaw).connect(env);
    tri.connect(mixTri).connect(env);
    sin.connect(mixSin).connect(env);

    const noiseSrc = audioCtx.createBufferSource(); noiseSrc.buffer = noiseBuffer;
    const mixNoise = audioCtx.createGain(); mixNoise.gain.value = document.getElementById('mixNoise').value;
    noiseSrc.connect(mixNoise).connect(env);

    const totalTime = (atk + dec) + stepDuration + rel;
    sq.start(now); saw.start(now); tri.start(now); sin.start(now); noiseSrc.start(now);
    sq.stop(now + totalTime + 0.1); saw.stop(now + totalTime + 0.1); tri.stop(now + totalTime + 0.1); sin.stop(now + totalTime + 0.1); noiseSrc.stop(now + totalTime + 0.1);
}

// Listeners
document.getElementById('filterFreq').oninput = (e) => filterNode.frequency.value = e.target.value;
document.getElementById('delayMix').oninput = (e) => delayGain.gain.value = e.target.value;
document.getElementById('reverbMix').oninput = (e) => reverbGain.gain.value = e.target.value;
document.getElementById('masterVolume').oninput = (e) => masterGain.gain.value = e.target.value;

// ========== PITCH BEND SPRING LOGIC ==========
const pitchSlider = document.getElementById('pitchBend');

// Detecta cuando se suelta el clic (ratón)
pitchSlider.addEventListener('mouseup', () => {
    pitchSlider.value = 500; // Vuelve al centro
});

// Detecta cuando se suelta el toque (móvil/tablet)
pitchSlider.addEventListener('touchend', () => {
    pitchSlider.value = 500; // Vuelve al centro
});


// ========== DATOS ==========
let song = { phrases: [createEmptyPhrase()] };
let currentPhraseIndex = 0;
let pageOffset = 0;
let nextPhraseIndex = null;

function createEmptyPhrase() { return Array(8).fill(null).map(() => ({ value: 500, enabled: true })); }

// ========== LÓGICA MUSICAL ==========
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function getMusicalInfo(sliderValue, octaveSetting) {
    const octaveMap = { 0: 24, 1: 36, 2: 48, 3: 60 };
    let baseMidi = octaveMap[octaveSetting];
    let semitones = Math.round((sliderValue / 1000) * 24); 
    let finalMidi = baseMidi + semitones;
    return { note: noteNames[finalMidi % 12] + (Math.floor(finalMidi / 12) - 1), freq: 440 * Math.pow(2, (finalMidi - 69) / 12.0) };
}

// ========== SECUENCIADOR ==========
let isPlaying = false;
let stepIndex = 0;
let nextStepTime = 0;
let timerID = null;

function scheduler() {
    while (nextStepTime < audioCtx.currentTime + 0.1) {
        scheduleNote(stepIndex, nextStepTime);
        nextStep();
    }
    timerID = setTimeout(scheduler, 25.0);
}

function scheduleNote(stepNum, time) {
    const phrase = song.phrases[currentPhraseIndex];
    const stepData = phrase[stepNum];
    
    setTimeout(() => {
        if(isPlaying) updateStepUI(stepNum);
    }, (time - audioCtx.currentTime) * 1000);

    if (!stepData.enabled) return;

    const octaveSel = parseInt(document.getElementById('octaveRange').value);
    const info = getMusicalInfo(stepData.value, octaveSel);
    playNote(info.freq);
}

function nextStep() {
    const tempo = parseInt(document.getElementById('tempo').value);
    const dir = document.getElementById('direction').value;
    const maxSteps = parseInt(document.getElementById('stepCount').value);

    let nextIdx;
    if (dir === 'up') {
        nextIdx = (stepIndex + 1) % maxSteps;
    } else {
        nextIdx = (stepIndex - 1 + maxSteps) % maxSteps;
    }

    if (nextIdx === 0 && nextPhraseIndex !== null) {
        currentPhraseIndex = nextPhraseIndex;
        nextPhraseIndex = null;
        renderSequencer();
        renderPhraseButtons();
    }

    stepIndex = nextIdx;
    nextStepTime += (60.0 / tempo);
}

// ========== UI ==========
function renderSequencer() {
    const ui = document.getElementById('sequencerUI'); ui.innerHTML = '';
    const phrase = song.phrases[currentPhraseIndex];
    const maxSteps = parseInt(document.getElementById('stepCount').value);

    for (let i = 0; i < 8; i++) {
        const step = phrase[i];
        const div = document.createElement('div'); 
        div.className = 'step-container';
        if (i >= maxSteps) div.classList.add('disabled-step');
        div.id = `step-container-${i}`;
        
        const input = document.createElement('input'); input.type = 'range'; input.min = 0; input.max = 1000; input.value = step.value; input.className = 'slider-vertical';
        input.oninput = (e) => { step.value = parseInt(e.target.value); updateStepDisplay(i); };
        
        const noteLbl = document.createElement('div'); noteLbl.className = 'note-label'; noteLbl.id = `note-${i}`;
        const sw = document.createElement('input'); sw.type = 'checkbox'; sw.className = 'switch-checkbox'; sw.checked = step.enabled;
        sw.onchange = (e) => step.enabled = e.target.checked;
        
        div.appendChild(input); div.appendChild(noteLbl); div.appendChild(sw);
        ui.appendChild(div);
        updateStepDisplay(i);
    }
}

document.getElementById('stepCount').onchange = () => {
    stepIndex = 0;
    renderSequencer();
};

function updateStepDisplay(index) {
    const phrase = song.phrases[currentPhraseIndex];
    const info = getMusicalInfo(phrase[index].value, parseInt(document.getElementById('octaveRange').value));
    const el = document.getElementById(`note-${index}`);
    if(el) el.innerText = info.note;
}

function updateStepUI(activeIndex) {
    document.querySelectorAll('.step-container').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(`step-container-${activeIndex}`);
    if(el) el.classList.add('active');
}

function renderPhraseButtons() {
    const container = document.getElementById('phraseButtons'); container.innerHTML = '';
    const totalPhrases = song.phrases.length;
    const maxPage = Math.floor((totalPhrases - 1) / 8);
    document.getElementById('prevPage').disabled = pageOffset <= 0;
    document.getElementById('nextPage').disabled = pageOffset >= maxPage;
    for(let i = 0; i < 8; i++) {
        const realIndex = pageOffset * 8 + i;
        const btn = document.createElement('button'); btn.className = 'phrase-btn'; btn.innerText = realIndex + 1;
        if (realIndex < totalPhrases) {
            btn.disabled = false;
            if (realIndex === currentPhraseIndex) btn.classList.add('active');
            if (realIndex === nextPhraseIndex) btn.classList.add('queued');
            btn.onclick = () => {
                if (!isPlaying) {
                    currentPhraseIndex = realIndex;
                    renderSequencer();
                } else {
                    nextPhraseIndex = realIndex;
                }
                renderPhraseButtons();
            };
        } else { btn.disabled = true; }
        container.appendChild(btn);
    }
    document.getElementById('phraseCountDisplay').innerText = totalPhrases;
}

// ========== CONTROLES TRANSPORTE ==========
function startPlayback() {
    if (isPlaying) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPlaying = true;
    nextStepTime = audioCtx.currentTime;
    scheduler();
}
function stopPlayback() {
    isPlaying = false;
    clearTimeout(timerID);
}
function resetSequencer() {
    stepIndex = 0;
    updateStepUI(0);
}

document.getElementById('playBtn').onclick = startPlayback;
document.getElementById('stopBtn').onclick = stopPlayback;
document.getElementById('resetBtn').onclick = resetSequencer;

document.getElementById('addPhraseBtn').onclick = () => {
    song.phrases.push(createEmptyPhrase());
    const newPage = Math.floor((song.phrases.length - 1) / 8);
    pageOffset = newPage;
    currentPhraseIndex = song.phrases.length - 1;
    renderSequencer();
    renderPhraseButtons();
};

document.getElementById('prevPage').onclick = () => { pageOffset--; renderPhraseButtons(); };
document.getElementById('nextPage').onclick = () => { pageOffset++; renderPhraseButtons(); };

// Init
renderSequencer();
renderPhraseButtons();
