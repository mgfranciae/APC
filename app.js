/* ==========================================
   PREVENIR SCROLL EN MÓVIL
   ========================================== */
document.addEventListener('touchmove', function(e) {
    if (e.target.type === 'range') {
        e.preventDefault();
    }
}, { passive: false });

/* ==========================================
   MOTOR DE AUDIO
   ========================================== */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
    for (let i = 0; i < n_samples; ++i) { 
        const x = (i * 2) / n_samples - 1; 
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x)); 
    }
    return curve;
}

document.getElementById('distortionAmount').oninput = (e) => {
    distortionNode.curve = parseInt(e.target.value) === 0 ? null : makeDistortionCurve(parseInt(e.target.value));
};

document.getElementById('filterFreq').oninput = (e) => filterNode.frequency.value = e.target.value;
document.getElementById('reverbMix').oninput = (e) => reverbGain.gain.value = e.target.value;
document.getElementById('delayMix').oninput = (e) => delayGain.gain.value = e.target.value;
document.getElementById('masterVolume').oninput = (e) => masterGain.gain.value = e.target.value;

const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseData = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBuffer.length; i++) noiseData[i] = Math.random() * 2 - 1;

/* ==========================================
   REPRODUCIR NOTA
   ========================================== */
function playNote(baseFreq, tie = false, port = false) {
    if (baseFreq === 0) return;
    
    const pbSlider = document.getElementById('pitchBend');
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
    
    if (tie && lastFreq !== null) {
        env.gain.setValueAtTime(1, now);
    } else {
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(1, now + atk);
        env.gain.linearRampToValueAtTime(sus, now + atk + dec);
    }
    env.gain.setValueAtTime(sus, noteOffTime);
    env.gain.linearRampToValueAtTime(0, noteOffTime + rel);

    const sq = audioCtx.createOscillator(); sq.type = 'square';
    const saw = audioCtx.createOscillator(); saw.type = 'sawtooth';
    const tri = audioCtx.createOscillator(); tri.type = 'triangle';
    const sin = audioCtx.createOscillator(); sin.type = 'sine';
    
    const mixSq = audioCtx.createGain(); mixSq.gain.value = document.getElementById('mixSq').value;
    const mixSaw = audioCtx.createGain(); mixSaw.gain.value = document.getElementById('mixSaw').value;
    const mixTri = audioCtx.createGain(); mixTri.gain.value = document.getElementById('mixTri').value;
    const mixSin = audioCtx.createGain(); mixSin.gain.value = document.getElementById('mixSin').value * 1.5;

    if (port && lastFreq !== null) {
        const portTime = 0.5;
        sq.frequency.setValueAtTime(lastFreq, now);
        sq.frequency.exponentialRampToValueAtTime(finalFreq, now + portTime);
        saw.frequency.setValueAtTime(lastFreq, now);
        saw.frequency.exponentialRampToValueAtTime(finalFreq, now + portTime);
        tri.frequency.setValueAtTime(lastFreq, now);
        tri.frequency.exponentialRampToValueAtTime(finalFreq, now + portTime);
        sin.frequency.setValueAtTime(lastFreq, now);
        sin.frequency.exponentialRampToValueAtTime(finalFreq, now + portTime);
    } else {
        sq.frequency.value = finalFreq;
        saw.frequency.value = finalFreq;
        tri.frequency.value = finalFreq;
        sin.frequency.value = finalFreq;
    }

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
    
    lastFreq = finalFreq;
}

/* ==========================================
   PITCH BEND - RETORNO AL CENTRO
   ========================================== */
const pitchSlider = document.getElementById('pitchBend');

pitchSlider.addEventListener('change', () => {
    pitchSlider.value = 500;
});
pitchSlider.addEventListener('touchend', () => {
    pitchSlider.value = 500;
});

document.getElementById('octaveRange').addEventListener('change', () => {
    for (let i = 0; i < 8; i++) {
        updateStepDisplay(i);
    }
});

/* ==========================================
   DATOS
   ========================================== */
let song = { phrases: [createEmptyPhrase()] };
let currentPhraseIndex = 0;
let pageOffset = 0;
let nextPhraseIndex = null;

function createEmptyPhrase() { 
    return Array(8).fill(null).map(() => ({ value: 500, enabled: true, tie: false, port: false })); 
}

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function getMusicalInfo(sliderValue, octaveSetting) {
    const octaveMap = { 0: 24, 1: 36, 2: 48, 3: 60 };
    let baseMidi = octaveMap[octaveSetting];
    let semitones = Math.round((sliderValue / 1000) * 24); 
    let finalMidi = baseMidi + semitones;
    return { note: noteNames[finalMidi % 12] + (Math.floor(finalMidi / 12) - 1), freq: 440 * Math.pow(2, (finalMidi - 69) / 12.0) };
}

/* ==========================================
   SECUENCIADOR
   ========================================== */
let isPlaying = false;
let stepIndex = 0;
let nextStepTime = 0;
let timerID = null;
let lastFreq = null;

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
    playNote(info.freq, stepData.tie, stepData.port);
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

/* ==========================================
   UI
   ========================================== */
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
        
        const input = document.createElement('input'); 
        input.type = 'range'; 
        input.min = 0; 
        input.max = 1000; 
        input.value = step.value; 
        input.style.width = '10px';
        input.style.height = '100px';
        input.style.writingMode = 'vertical-lr';
        input.style.direction = 'rtl';
        input.oninput = (e) => { step.value = parseInt(e.target.value); updateStepDisplay(i); };
        
        const noteLbl = document.createElement('div'); 
        noteLbl.className = 'note-label'; 
        noteLbl.id = `note-${i}`;
        
        const sw = document.createElement('input'); 
        sw.type = 'checkbox'; 
        sw.className = 'switch-checkbox'; 
        sw.checked = step.enabled;
        sw.onchange = (e) => step.enabled = e.target.checked;
        
        const btnContainer = document.createElement('div'); 
        btnContainer.className = 'step-buttons';
        
        const tieBtn = document.createElement('button'); 
        tieBtn.className = 'step-btn tie' + (step.tie ? ' active' : ''); 
        tieBtn.innerText = 'T'; 
        tieBtn.onclick = () => { step.tie = !step.tie; renderSequencer(); };
        
        const portBtn = document.createElement('button'); 
        portBtn.className = 'step-btn port' + (step.port ? ' active' : ''); 
        portBtn.innerText = 'P'; 
        portBtn.onclick = () => { step.port = !step.port; renderSequencer(); };
        
        btnContainer.appendChild(tieBtn); 
        btnContainer.appendChild(portBtn);
        
        div.appendChild(input); 
        div.appendChild(noteLbl); 
        div.appendChild(sw); 
        div.appendChild(btnContainer);
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
    const container = document.getElementById('phraseButtons'); 
    container.innerHTML = '';
    const totalPhrases = song.phrases.length;
    const maxPage = Math.floor((totalPhrases - 1) / 8);
    document.getElementById('prevPage').disabled = pageOffset <= 0;
    document.getElementById('nextPage').disabled = pageOffset >= maxPage;
    
    for(let i = 0; i < 8; i++) {
        const realIndex = pageOffset * 8 + i;
        const btn = document.createElement('button'); 
        btn.className = 'phrase-btn'; 
        btn.innerText = realIndex + 1;
        
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
        } else { 
            btn.disabled = true; 
        }
        container.appendChild(btn);
    }
    document.getElementById('phraseCountDisplay').innerText = totalPhrases;
}

/* ==========================================
   TRANSPORTE
   ========================================== */
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
    lastFreq = null;
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

/* ==========================================
   CONTROLES DE TECLADO
   ========================================== */
document.addEventListener('keydown', (e) => {
    // Espacio: play/stop
    if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) stopPlayback(); else startPlayback();
        return;
    }
    // Escape: reset
    if (e.code === 'Escape') {
        e.preventDefault();
        resetSequencer();
        return;
    }
    
    // N/M para reverb
    if (e.code === 'KeyN') {
        e.preventDefault();
        const rev = document.getElementById('reverbMix');
        rev.value = Math.min(1, parseFloat(rev.value) + 0.1);
        reverbGain.gain.value = rev.value;
        return;
    }
    if (e.code === 'KeyM') {
        e.preventDefault();
        const rev = document.getElementById('reverbMix');
        rev.value = Math.max(0, parseFloat(rev.value) - 0.1);
        reverbGain.gain.value = rev.value;
        return;
    }
    // J/K para echo
    if (e.code === 'KeyJ') {
        e.preventDefault();
        const del = document.getElementById('delayMix');
        del.value = Math.min(1, parseFloat(del.value) + 0.1);
        delayGain.gain.value = del.value;
        return;
    }
    if (e.code === 'KeyK') {
        e.preventDefault();
        const del = document.getElementById('delayMix');
        del.value = Math.max(0, parseFloat(del.value) - 0.1);
        delayGain.gain.value = del.value;
        return;
    }
    
    // W/S para pitch bend
    if (e.key === 'w' || e.key === 'W') {
        pitchSlider.value = Math.min(1000, parseInt(pitchSlider.value) + 50);
        return;
    }
    if (e.key === 's' || e.key === 'S') {
        pitchSlider.value = Math.max(0, parseInt(pitchSlider.value) - 50);
        return;
    }
    
    // -/+ para volumen
    if (e.key === '-') {
        const vol = document.getElementById('masterVolume');
        vol.value = Math.max(0, parseFloat(vol.value) - 0.1);
        masterGain.gain.value = vol.value;
        return;
    }
    if (e.key === '+' || e.key === '=') {
        const vol = document.getElementById('masterVolume');
        vol.value = Math.min(1, parseFloat(vol.value) + 0.1);
        masterGain.gain.value = vol.value;
        return;
    }
    if (e.key === '+' || e.key === '=') {
        const vol = document.getElementById('masterVolume');
        vol.value = Math.min(1, parseFloat(vol.value) + 0.05);
        masterGain.gain.value = vol.value;
        return;
    }
    
    // Z/X para distortion
    if (e.key === 'z' || e.key === 'Z') {
        const dist = document.getElementById('distortionAmount');
        dist.value = Math.max(0, parseInt(dist.value) - 5);
        dist.dispatchEvent(new Event('input'));
        return;
    }
    if (e.key === 'x' || e.key === 'X') {
        const dist = document.getElementById('distortionAmount');
        dist.value = Math.min(100, parseInt(dist.value) + 5);
        dist.dispatchEvent(new Event('input'));
        return;
    }
    
    // C/V para filtro
    if (e.key === 'c' || e.key === 'C') {
        const filt = document.getElementById('filterFreq');
        filt.value = Math.max(100, parseInt(filt.value) - 100);
        filterNode.frequency.value = filt.value;
        return;
    }
    if (e.key === 'v' || e.key === 'V') {
        const filt = document.getElementById('filterFreq');
        filt.value = Math.min(5000, parseInt(filt.value) + 100);
        filterNode.frequency.value = filt.value;
        return;
    }
    
    // A/D para navegar páginas
    if (e.key === 'a' || e.key === 'A') {
        if (pageOffset > 0) { pageOffset--; renderPhraseButtons(); }
        return;
    }
    if (e.key === 'd' || e.key === 'D') {
        const totalPhrases = song.phrases.length;
        const maxPage = Math.floor((totalPhrases - 1) / 8);
        if (pageOffset < maxPage) { pageOffset++; renderPhraseButtons(); }
        return;
    }
    
    // 1-8 para seleccionar frase
    const num = parseInt(e.key);
    if (num >= 1 && num <= 8) {
        const phraseIndex = pageOffset * 8 + (num - 1);
        if (phraseIndex < song.phrases.length) {
            if (!isPlaying) {
                currentPhraseIndex = phraseIndex;
                renderSequencer();
            } else {
                nextPhraseIndex = phraseIndex;
            }
            renderPhraseButtons();
        }
    }
});

// Reset pitch to center when keys are released
document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S') {
        const pitchSlider = document.getElementById('pitchBend');
        pitchSlider.value = 500;
    }
});

/* ==========================================
   GUARDAR / CARGAR
   ========================================== */

// Guardar Presets (Mezcla + Envelope + Efectos)
document.getElementById('savePresetsBtn').onclick = () => {
    const name = prompt('Nombre del preset:', 'preset');
    if (!name) return;
    const presets = {
        name: name,
        mixSq: document.getElementById('mixSq').value,
        mixSaw: document.getElementById('mixSaw').value,
        mixTri: document.getElementById('mixTri').value,
        mixSin: document.getElementById('mixSin').value,
        mixNoise: document.getElementById('mixNoise').value,
        atk: document.getElementById('atk').value,
        dec: document.getElementById('dec').value,
        sus: document.getElementById('sus').value,
        rel: document.getElementById('rel').value,
        distortionAmount: document.getElementById('distortionAmount').value,
        filterFreq: document.getElementById('filterFreq').value,
        reverbMix: document.getElementById('reverbMix').value,
        delayMix: document.getElementById('delayMix').value,
        masterVolume: document.getElementById('masterVolume').value,
        pitchBend: document.getElementById('pitchBend').value
    };
    downloadJSON(presets, name + '.json');
};

// Cargar Presets
document.getElementById('loadPresetsBtn').onclick = () => {
    document.getElementById('loadPresetsInput').click();
};

document.getElementById('loadPresetsInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const presets = JSON.parse(event.target.result);
            document.getElementById('mixSq').value = presets.mixSq;
            document.getElementById('mixSaw').value = presets.mixSaw;
            document.getElementById('mixTri').value = presets.mixTri;
            document.getElementById('mixSin').value = presets.mixSin;
            document.getElementById('mixNoise').value = presets.mixNoise;
            document.getElementById('atk').value = presets.atk;
            document.getElementById('dec').value = presets.dec;
            document.getElementById('sus').value = presets.sus;
            document.getElementById('rel').value = presets.rel;
            document.getElementById('distortionAmount').value = presets.distortionAmount;
            document.getElementById('filterFreq').value = presets.filterFreq;
            document.getElementById('reverbMix').value = presets.reverbMix;
            document.getElementById('delayMix').value = presets.delayMix;
            document.getElementById('masterVolume').value = presets.masterVolume;
            document.getElementById('pitchBend').value = presets.pitchBend;
            
            // Actualizar audio
            masterGain.gain.value = presets.masterVolume;
            reverbGain.gain.value = presets.reverbMix;
            delayGain.gain.value = presets.delayMix;
            filterNode.frequency.value = presets.filterFreq;
            distortionNode.curve = parseInt(presets.distortionAmount) === 0 ? null : makeDistortionCurve(parseInt(presets.distortionAmount));
        } catch (err) {
            alert('Error al cargar presets');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// Guardar Canción
document.getElementById('saveSongBtn').onclick = () => {
    const name = prompt('Nombre de la canción:', 'song');
    if (!name) return;
    const songData = {
        name: name,
        octaveRange: document.getElementById('octaveRange').value,
        tempo: document.getElementById('tempo').value,
        direction: document.getElementById('direction').value,
        stepCount: document.getElementById('stepCount').value,
        phrases: song.phrases.map(phrase => 
            phrase.map(step => ({
                value: step.value,
                enabled: step.enabled,
                tie: step.tie,
                port: step.port
            }))
        )
    };
    downloadJSON(songData, name + '.json');
};

// Cargar Canción
document.getElementById('loadSongBtn').onclick = () => {
    document.getElementById('loadSongInput').click();
};

document.getElementById('loadSongInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const songData = JSON.parse(event.target.result);
            document.getElementById('octaveRange').value = songData.octaveRange;
            document.getElementById('tempo').value = songData.tempo;
            document.getElementById('direction').value = songData.direction;
            document.getElementById('stepCount').value = songData.stepCount;
            
            // Restaurar frases
            song.phrases = songData.phrases.map(phraseData => 
                phraseData.map(stepData => ({
                    value: stepData.value,
                    enabled: stepData.enabled,
                    tie: stepData.tie,
                    port: stepData.port
                }))
            );
            
            currentPhraseIndex = 0;
            renderSequencer();
            renderPhraseButtons();
        } catch (err) {
            alert('Error al cargar canción');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// Función auxiliar para descargar JSON
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* ==========================================
   INICIALIZAR
   ========================================== */
renderSequencer();
renderPhraseButtons();
