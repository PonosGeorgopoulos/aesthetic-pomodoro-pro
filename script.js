(function () {
    'use strict';

    /*
      *****************************************************************************
      *                                                                           *
      *   ██████╗███████╗███████╗    ███████╗ ██████╗██████╗ ██╗██████╗ ████████╗ *
      *  ██╔════╝██╔════╝██╔════╝    ██╔════╝██╔════╝██╔══██╗██║██╔══██╗╚══██╔══╝ *
      *  ██║     ███████╗███████╗    ███████╗██║     ██████╔╝██║██████╔╝   ██║    *
      *  ██║     ╚════██║╚════██║    ╚════██║██║     ██╔══██╗██║██╔═══╝    ██║    *
      *  ╚██████╗███████║███████║    ███████║╚██████╗██║  ██║██║██║        ██║    *
      *   ╚═════╝╚══════╝╚══════╝    ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝    *
      *                                                                           *
      *                  AESTHETIC POMODORO PRO - CORE LOGIC                      *
      *****************************************************************************
    
    */

    // --------------------------------------------------------------------------
    //  [1] GLOBAL STATE & CONFIGURATION
    // --------------------------------------------------------------------------
    const State = {
        timer: null,             // Reference to the active setInterval
        isPlaying: false,        // Playback state of the pomodoro
        currentMode: 'focus',    // Current session: focus, short, or long

        // Duration defaults (with persistent localStorage recovery)
        focusDuration: parseInt(localStorage.getItem('pomodoroFocusDuration')) || 25 * 60,
        breakTime: parseInt(localStorage.getItem('pomodoroBreakTime')) || 0,

        activeSubject: null,     // Current subject being tracked
        pieChart: null,          // Chart.js instance for the tracker
        dailyPieChart: null,     // Chart.js instance for the daily breakdown

        mainChartType: 'pie',    // Toggle state: pie or bar
        dailyChartType: 'pie',
        trackerRange: 'all-time',// Data filtering scale

        bgIndex: 0,              // Cycle index for nature backgrounds
        calendarDate: new Date(),// Shared date for mini-calendar
        neoCalDate: new Date(),  // Shared date for Neumorphic planner calendar

        weatherCity: localStorage.getItem('weatherCity') || 'Athens',
        weatherLat: parseFloat(localStorage.getItem('weatherLat')) || 37.9838,
        weatherLon: parseFloat(localStorage.getItem('weatherLon')) || 23.7275,
        audioManuallyPaused: false, // User override for Neural Audio
        alarmSound: 'bell'          // Current alarm selection
    };

    // --------------------------------------------------------------------------
    //  NATIVE WEB AUDIO NEURAL ENGINE
    // --------------------------------------------------------------------------
    class NeuralAudioEngine {
        constructor(profile = 'focus') {
            this.profile = profile;
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0;

            this.isStarted = false;
            this.activeNodes = [];
            this.intervals = [];

            if (this.profile === 'relax') {
                this.roots = [32.70, 34.65, 36.71, 38.89, 41.20, 43.65, 46.25, 49.00, 51.91, 55.00, 58.27, 61.74]; // Octave C1
                this.rootKey = this.roots[Math.floor(Math.random() * this.roots.length)];

                const modes = {
                    'aeolian_drifter': [[1, 6 / 5, 3 / 2], [8 / 5, 2, 12 / 5], [4 / 3, 8 / 5, 2], [1, 6 / 5, 3 / 2]],
                    'dorian_ocean': [[1, 6 / 5, 3 / 2], [4 / 3, 5 / 3, 2], [10 / 9, 4 / 3, 5 / 3], [1, 6 / 5, 3 / 2]],
                    'phrygian_depths': [[1, 6 / 5, 3 / 2], [16 / 15, 6 / 5, 8 / 5], [4 / 3, 8 / 5, 2], [1, 6 / 5, 3 / 2]]
                };
                const modeKeys = Object.keys(modes);
                this.selectedMode = modeKeys[Math.floor(Math.random() * modeKeys.length)];
                this.ratios = modes[this.selectedMode];
                this.chordDurationMs = Math.floor((Math.random() * 60000) + 60000); // 60-120s
            } else {
                this.roots = [65.41, 69.30, 73.42, 77.78, 82.41, 87.31, 92.50, 98.00, 103.83, 110.00, 116.54, 123.47]; // Octave C2
                this.rootKey = this.roots[Math.floor(Math.random() * this.roots.length)];

                const modes = ['postrock_minor', 'ambient_major', 'drifting_lydian', 'melancholic_dorian'];
                this.selectedMode = modes[Math.floor(Math.random() * modes.length)];

                if (this.selectedMode === 'postrock_minor') this.ratios = [[1, 6 / 5, 3 / 2], [8 / 5, 2, 12 / 5], [6 / 5, 36 / 25, 9 / 5], [9 / 5, 54 / 25, 27 / 10]];
                else if (this.selectedMode === 'ambient_major') this.ratios = [[1, 5 / 4, 3 / 2], [4 / 3, 5 / 3, 2], [5 / 3, 2, 5 / 2], [3 / 2, 15 / 8, 9 / 4]];
                else if (this.selectedMode === 'drifting_lydian') this.ratios = [[1, 5 / 4, 3 / 2], [9 / 8, 45 / 32, 27 / 16], [15 / 8, 9 / 4, 45 / 16], [1, 5 / 4, 3 / 2]];
                else this.ratios = [[1, 6 / 5, 3 / 2], [4 / 3, 5 / 3, 2], [9 / 5, 54 / 25, 27 / 10], [1, 6 / 5, 3 / 2]];
                this.chordDurationMs = Math.floor((Math.random() * 35000) + 40000); // 40-75s
            }

            this.chords = this.ratios.map(chord => chord.map(r => this.rootKey * r));
            this.chordIdx = 0;

            this.setupEffectsNetwork();
        }

        setupEffectsNetwork() {
            this.reverbSend = this.ctx.createGain();
            this.reverbSend.gain.value = 1.0;
            this.reverbSend.connect(this.masterGain);

            const delays = [1.13, 2.41, 4.33];
            const gains = [0.40, 0.25, 0.15];

            delays.forEach((time, i) => {
                let del = this.ctx.createDelay(10);
                del.delayTime.value = time;
                let fbk = this.ctx.createGain();
                fbk.gain.value = gains[i];
                this.reverbSend.connect(del);
                del.connect(this.masterGain);
                del.connect(fbk);
                fbk.connect(del);
                this.activeNodes.push(del, fbk); // Keep alive
            });

            // 15.0 Hz Entrainment AM (Neural Phase Locking)
            this.amEngine = this.ctx.createGain();
            this.amEngine.connect(this.ctx.destination);
            this.masterGain.disconnect();
            this.masterGain.connect(this.amEngine);

            this.amOsc = this.ctx.createOscillator();
            this.amOsc.type = 'sine';
            this.amOsc.frequency.value = this.profile === 'relax' ? 10.0 : 15.0; // 10Hz Alpha vs 15Hz Beta

            const amDepth = 0.22;
            this.amDepthGain = this.ctx.createGain();
            this.amDepthGain.gain.value = amDepth / 2.0;

            this.amEngine.gain.value = 1.0 - (amDepth / 2.0);

            this.amOsc.connect(this.amDepthGain);
            this.amDepthGain.connect(this.amEngine.gain);
            this.amOsc.start();
            this.activeNodes.push(this.amOsc, this.amDepthGain, this.amEngine);
        }

        start() {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            if (this.isStarted) return;
            this.isStarted = true;

            // Phase 2: Fade-in smoothly to avoid pops when immediately replacing an overlapping context 
            this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 2.0);

            this.playChordSequence();
            this.startPianoArpeggios();
        }

        stop() {
            if (!this.isStarted) return;

            // Phase 2: Smooth 2-second linear fade out crossfade to avoid harsh cut-offs or math errors
            this.masterGain.gain.cancelScheduledValues(this.ctx.currentTime);
            const currentVol = this.masterGain.gain.value;
            this.masterGain.gain.setValueAtTime(currentVol, this.ctx.currentTime);
            this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 2.5);

            this.intervals.forEach(clearInterval);
            this.intervals = [];

            setTimeout(() => {
                this.activeNodes.forEach(n => { try { if (n.stop) n.stop(); } catch (e) { } });
                try { this.ctx.close(); } catch (e) { } // Completely destroy context to free browser memory
            }, 3500);

            this.isStarted = false; // Mark immediately to prevent double stops
        }

        playChordSequence() {
            const trigger = () => {
                if (!this.isStarted) return;
                this.triggerChord(this.chords[this.chordIdx % 4]);
                this.chordIdx++;
            };
            trigger();
            this.intervals.push(setInterval(trigger, this.chordDurationMs));
        }

        triggerChord(freqs) {
            freqs.forEach(freq => {
                const now = this.ctx.currentTime;
                // Cello Drone
                const celloOsc = this.ctx.createOscillator();
                celloOsc.type = 'sawtooth';
                celloOsc.frequency.value = freq;
                const celloFilt = this.ctx.createBiquadFilter();
                celloFilt.type = 'lowpass';
                celloFilt.frequency.value = Math.min(freq * 5.0, 350.0);
                const celloGain = this.ctx.createGain();
                const maxCelloVol = 0.18 / 3.0;
                celloGain.gain.setValueAtTime(0, now);
                celloGain.gain.linearRampToValueAtTime(maxCelloVol, now + 5.0);
                celloGain.gain.setValueAtTime(maxCelloVol, now + (this.chordDurationMs / 1000) - 2.0);
                celloGain.gain.linearRampToValueAtTime(0, now + (this.chordDurationMs / 1000) + 2.0);
                celloOsc.connect(celloFilt).connect(celloGain).connect(this.reverbSend);
                celloOsc.start();
                this.activeNodes.push(celloOsc);
                setTimeout(() => { try { celloOsc.stop(); } catch (e) { } }, this.chordDurationMs + 2500);

                // Guitar Swell
                const guitarOsc = this.ctx.createOscillator();
                guitarOsc.type = 'triangle';
                guitarOsc.frequency.value = freq * 2.0;
                const lfo = this.ctx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.value = Math.random() * 3 + 3; // 3-6 Hz
                const lfoGain = this.ctx.createGain();
                lfoGain.gain.value = (freq * 2.0) * 0.008;
                lfo.connect(lfoGain).connect(guitarOsc.frequency);
                lfo.start();

                const guitarVol = this.ctx.createGain();
                const maxGuitarVol = 0.14 / 3.0;
                const swellTime = this.chordDurationMs / 1000;
                guitarVol.gain.setValueAtTime(0, now);
                guitarVol.gain.linearRampToValueAtTime(maxGuitarVol, now + (swellTime / 2.0));
                guitarVol.gain.linearRampToValueAtTime(0, now + swellTime);

                guitarOsc.connect(guitarVol).connect(this.reverbSend);
                guitarOsc.start();
                this.activeNodes.push(guitarOsc, lfo);
                setTimeout(() => { try { guitarOsc.stop(); lfo.stop(); } catch (e) { } }, this.chordDurationMs + 500);
            });
        }

        startPianoArpeggios() {
            const schedulePianoNote = () => {
                if (!this.isStarted) return;
                const currentChord = this.chords[(this.chordIdx - 1) % 4] || this.chords[0];
                const noteFreq = currentChord[Math.floor(Math.random() * currentChord.length)];
                const finalFreq = noteFreq * [2.0, 4.0, 8.0][Math.floor(Math.random() * 3)];

                const now = this.ctx.currentTime;
                const oscSine = this.ctx.createOscillator();
                oscSine.type = 'sine'; oscSine.frequency.value = finalFreq;

                const harmonicNodes = [];

                const oscHarmonic2 = this.ctx.createOscillator();
                oscHarmonic2.type = 'sine'; oscHarmonic2.frequency.value = finalFreq * 2.0;
                const harmonic2Gain = this.ctx.createGain(); harmonic2Gain.gain.value = 0.2;
                oscHarmonic2.connect(harmonic2Gain);
                harmonicNodes.push(oscHarmonic2);

                // Relax profile uses warmer bell-like tones (3rd harmonic)
                let harmonic3Gain = null;
                let oscHarmonic3 = null;
                if (this.profile === 'relax') {
                    oscHarmonic3 = this.ctx.createOscillator();
                    oscHarmonic3.type = 'sine'; oscHarmonic3.frequency.value = finalFreq * 3.0;
                    harmonic3Gain = this.ctx.createGain(); harmonic3Gain.gain.value = 0.05;
                    oscHarmonic3.connect(harmonic3Gain);
                    harmonicNodes.push(oscHarmonic3);
                }

                const pianoGain = this.ctx.createGain();
                oscSine.connect(pianoGain);
                harmonic2Gain.connect(pianoGain);
                if (harmonic3Gain) harmonic3Gain.connect(pianoGain);

                pianoGain.connect(this.reverbSend);

                // Relax rings longer than Focus
                const ringDecay = this.profile === 'relax' ? 18.0 : 8.0;

                pianoGain.gain.setValueAtTime(0, now);
                pianoGain.gain.linearRampToValueAtTime(0.08, now + 0.05);
                pianoGain.gain.exponentialRampToValueAtTime(0.001, now + ringDecay);

                oscSine.start(now);
                harmonicNodes.forEach(n => n.start(now));
                this.activeNodes.push(oscSine, ...harmonicNodes);

                setTimeout(() => { try { oscSine.stop(); harmonicNodes.forEach(n => n.stop()); } catch (e) { } }, ringDecay * 1000 + 500);

                const minDelay = this.profile === 'relax' ? 12000 : 4000;
                const randomAdded = this.profile === 'relax' ? 16000 : 10000;
                const nextTimeMs = Math.random() * randomAdded + minDelay;
                this.intervals.push(setTimeout(schedulePianoNote, nextTimeMs));
            };
            this.intervals.push(setTimeout(schedulePianoNote, Math.random() * 10000 + 5000));
        }
    }

    let globalNeuralEngine = null; // Will be instantiated on first user interaction 


    const DURATION_MAP = {
        'focus': State.focusDuration,
        'short': 5 * 60,
        'long': 15 * 60
    };

    // --------------------------------------------------------------------------
    //  [2] DATA PERSISTENCE & INITIALIZATION
    // --------------------------------------------------------------------------
    let times = { ...DURATION_MAP };

    // Backgrounds: 40 pre-generated nature scenes (compressed)
    const backgrounds = Array.from({ length: 40 }, (_, i) => `images/bg${i + 1}.jpg`);

    // Aesthetic Overlays based on timer mode
    const modeGradients = {
        'focus': 'linear-gradient(135deg, rgba(255, 229, 217, 0.6), rgba(255, 202, 212, 0.6))',
        'short': 'linear-gradient(135deg, rgba(216, 243, 220, 0.6), rgba(183, 228, 199, 0.6))',
        'long': 'linear-gradient(135deg, rgba(216, 243, 220, 0.6), rgba(183, 228, 199, 0.6))'
    };

    // Tracker DB: Main subject accumulation
    let subjectData = JSON.parse(localStorage.getItem('pomodoroSubjectData'));
    if (!subjectData || Object.keys(subjectData).length === 0) {
        subjectData = { 'Mathematics 📝': 0, 'Programming 💻': 0, 'Reading 📚': 0, 'Physics ⚛️': 0 };
        localStorage.setItem('pomodoroSubjectData', JSON.stringify(subjectData));
    }
    if (subjectData && Object.keys(subjectData).length > 0) {
        State.activeSubject = Object.keys(subjectData)[0];
    }

    // Daily Timeline DB: Keyed by 'YYYY-MM-DD'
    let dailySubjectData = JSON.parse(localStorage.getItem('pomodoroDailySubjectData')) || {};

    // Planner DB: Events, Schedules, and Tasks
    let userCustomEvents = JSON.parse(localStorage.getItem('userCustomEvents')) || {};
    let userWeeklySchedules = JSON.parse(localStorage.getItem('userWeeklySchedules')) || {};
    let userYearlyEvents = JSON.parse(localStorage.getItem('userYearlyEvents')) || {};
    let neoTodos = JSON.parse(localStorage.getItem('neo-todos')) || [];
    let neoEventsList = JSON.parse(localStorage.getItem('neo-events')) || [];

    // Localized Strings & Visual Palettes
    const greekMonths = ["Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος", "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος"];
    const aestheticColors = ['#a1c4fd', '#ffcad4', '#b7e4c7', '#d8f3dc', '#ffe5d9', '#e0c3fc', '#fcf6bd', '#d0f4de', '#e4c1f9', '#f3c4fb'];

    // Migration Utility: Ensures legacy single-string events are converted to arrays
    function ensureArray(targetObj) {
        Object.keys(targetObj).forEach(key => {
            if (typeof targetObj[key] === 'string') {
                targetObj[key] = [targetObj[key]];
            }
        });
    }
    ensureArray(userCustomEvents);
    ensureArray(userYearlyEvents);
    ensureArray(userWeeklySchedules);

    // --------------------------------------------------------------------------
    //  [3] DOM ELEMENT CACHE
    // --------------------------------------------------------------------------
    const UI = {
        timeDisplay: document.getElementById('time-left'),
        startBtn: document.getElementById('btn-start'),
        pauseBtn: document.getElementById('btn-pause'),
        resetBtn: document.getElementById('btn-reset'),
        focusBtn: document.getElementById('btn-focus'),
        shortBtn: document.getElementById('btn-short'),
        longBtn: document.getElementById('btn-long'),
        subjectInput: document.getElementById('subject-input'),
        subjectList: document.getElementById('subject-list'),
        alarmSoundSelect: document.getElementById('alarm-sound'), // Removed in HTML but ref kept for safety or replaced
        alarmSelector: document.getElementById('alarm-selector'),
        alarmDisplay: document.getElementById('alarm-display'),
        alarmMenu: document.getElementById('alarm-menu'),
        chartCanvas: document.getElementById('myChart'),
        dynamicIsland: document.getElementById('audio-dynamic-island'),
        islandToggleBtn: document.getElementById('btn-island-toggle'),
        islandCloseBtn: document.getElementById('btn-island-close')
    };

    // Notification Init
    // if ("Notification" in window) Notification.requestPermission();

    // --------------------------------------------------------------------------
    //  [4] CORE LOGIC & TIMER ENGINE
    // --------------------------------------------------------------------------

    function showDynamicIsland() {
        if (!UI.dynamicIsland) return;
        UI.dynamicIsland.classList.remove('hidden');

        // Update Title dynamically based on current mode
        const titleEl = document.querySelector('.island-title');
        const tooltipBox = document.getElementById('island-tooltip-box');
        if (titleEl) {
            titleEl.textContent = State.currentMode === 'focus' ? '15Hz Neural Entrainment' : '10Hz Alpha Relaxation';
        }

        if (tooltipBox) {
            if (State.currentMode === 'focus') {
                tooltipBox.innerHTML = `
                    <h4>15Hz: Απόλυτη Συγκέντρωση</h4>
                    Η συχνότητα των 15Hz (κύματα Beta) αυξάνει την εγρήγορση.
                    <ul style="margin-top: 5px;">
                      <li><b>Phase Locking:</b> Κλειδώνει τη σκέψη, μειώνοντας τους περισπασμούς.</li>
                      <li><b>Cello Drones & Arpeggios:</b> Απασχολούν το υποσυνείδητο.</li>
                    </ul>
                `;
            } else {
                tooltipBox.innerHTML = `
                    <h4>10Hz: Δημιουργική Χαλάρωση</h4>
                    Τα κύματα Alpha στα 10Hz μειώνουν το άγχος.
                    <ul style="margin-top: 5px;">
                      <li><b>Θερμότεροι Τόνοι:</b> Καμπανιστές αρμονικές που θυμίζουν φύση.</li>
                      <li><b>Μεγαλύτερα Decays:</b> Επιβραδύνουν τον αντιληπτικό χρόνο, προστατεύοντας από το burnout.</li>
                    </ul>
                `;
            }
        }

        if (State.audioManuallyPaused) {
            UI.dynamicIsland.classList.add('paused');
            document.getElementById('island-icon').textContent = '▶️';
            document.querySelector('.island-subtitle').textContent = 'Generative Audio Paused';
        } else {
            UI.dynamicIsland.classList.remove('paused');
            document.getElementById('island-icon').textContent = '⏸️';
            document.querySelector('.island-subtitle').textContent = 'Generative Audio Active';
        }
    }

    function hideDynamicIsland() {
        if (!UI.dynamicIsland) return;
        UI.dynamicIsland.classList.add('hidden');
    }

    const ALARM_SOUND_DATA = [
        { id: 'bell', label: 'Soft Bell', icon: '🔔' },
        { id: 'digital', label: 'Digital Alarm', icon: '⏰' },
        { id: 'pulse', label: 'Low Pulse', icon: '🌊' },
        { id: 'urgent', label: 'Urgent Beep', icon: '🚨' },
        { id: 'chime', label: 'Intense Chime', icon: '⚡' },
        { id: 'siren', label: 'Warning Siren', icon: '📣' }
    ];

    function initAlarmSelector() {
        if (!UI.alarmSelector || !UI.alarmMenu) return;

        function updateMenu() {
            UI.alarmMenu.innerHTML = '';
            ALARM_SOUND_DATA.forEach(sound => {
                const item = document.createElement('div');
                item.className = 'glass-dropdown-item';
                // Add active-selection class if this is the currently selected sound
                if (sound.id === State.alarmSound) {
                    item.classList.add('active-selection');
                }
                item.textContent = sound.icon;
                item.title = sound.label; // Tooltip for accessibility
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    State.alarmSound = sound.id;
                    updateDisplayLabel();
                    UI.alarmMenu.classList.remove('active');
                    playAlarm(true); // Preview
                });
                UI.alarmMenu.appendChild(item);
            });
        }

        function updateDisplayLabel() {
            const sound = ALARM_SOUND_DATA.find(s => s.id === State.alarmSound);
            if (sound && UI.alarmDisplay) {
                UI.alarmDisplay.innerHTML = `<span>${sound.icon} ${sound.label}</span>`;
            }
            updateMenu(); // Refilter menu when display updates
        }

        UI.alarmDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            UI.alarmMenu.classList.toggle('active');
        });

        document.addEventListener('click', () => {
            UI.alarmMenu.classList.remove('active');
        });

        updateDisplayLabel();
    }

    /**
     * Updates the body background based on the current mode and bg index.
     */
    function applyBackground() {
        const bgUrl = backgrounds[State.bgIndex];
        const grad = modeGradients[State.currentMode];
        
        // Ensure background gradient is visible even before image loads
        document.body.style.backgroundImage = `${grad}, none`;
        
        const img = new Image();
        img.onload = () => {
            document.body.style.backgroundImage = `${grad}, url('${bgUrl}')`;
            document.body.style.backgroundSize = '100% 100%, cover';
            document.body.style.backgroundPosition = 'center, center';
            document.body.style.backgroundRepeat = 'no-repeat, no-repeat';
            document.body.style.backgroundAttachment = 'fixed, fixed';
        };
        img.onerror = () => {
            console.error("Failed to load background image:", bgUrl);
            // Stay with just the gradient if the image fails
            document.body.style.backgroundImage = `${grad}`;
        };
        img.src = bgUrl;
    }

    // Auto-rotate backgrounds every 5 minutes
    setInterval(() => {
        State.bgIndex = (State.bgIndex + 1) % backgrounds.length;
        applyBackground();
    }, 5 * 60 * 1000);

    /**
     * Converts seconds into a formatted MM:SS string.
     */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Refreshes the UI timer display and the browser tab title.
     */
    function updateDisplay() {
        UI.timeDisplay.textContent = formatTime(times[State.currentMode]);
        document.title = `${formatTime(times[State.currentMode])} - Pomodoro`;
    }

    /**
     * Handles switching between Focus, Short Break, and Long Break.
     * @param {string} mode - 'focus', 'short', or 'long'
     */
    function switchMode(mode) {
        if (State.isPlaying) {
            clearInterval(State.timer);
            State.isPlaying = false;
            if (globalNeuralEngine) globalNeuralEngine.stop();
        }
        State.currentMode = mode;
        updateDisplay();
        applyBackground();

        [UI.focusBtn, UI.shortBtn, UI.longBtn].forEach(btn => btn.classList.remove('active'));
        if (mode === 'focus') { UI.focusBtn.classList.add('active'); document.body.className = 'focus-mode'; }
        else if (mode === 'short') { UI.shortBtn.classList.add('active'); document.body.className = 'short-break-mode'; }
        else if (mode === 'long') { UI.longBtn.classList.add('active'); document.body.className = 'long-break-mode'; }

        startTimer(); // Auto-start on mode switch
    }

    /**
     * Triggers the end-of-session alarm using Web Audio API.
     * @param {boolean} isPreview - If true, play briefly for preview
     */
    function playAlarm(isPreview = false) {
        if (!isPreview && "Notification" in window && Notification.permission === "granted") {
            new Notification("Time is up!", { body: State.currentMode === 'focus' ? "Break time!" : "Back to work!" });
        }
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            const soundType = State.alarmSound || 'bell';

            const playTime = isPreview ? 2 : 5; // Shorter for preview

            if (soundType === 'bell') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(400, audioCtx.currentTime + 3);
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.05);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 5);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 5);
            }
            else if (soundType === 'digital') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                for (let i = 0; i < 25; i++) {
                    let t = audioCtx.currentTime + (i * 0.2);
                    gainNode.gain.setValueAtTime(0.15, t);
                    gainNode.gain.setValueAtTime(0, t + 0.1);
                }
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 5);
            }
            else if (soundType === 'pulse') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 3);
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.5);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 5);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 5);
            }
            else if (soundType === 'urgent') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
                gainNode.gain.value = 0;
                for (let i = 0; i < 40; i++) {
                    let t = audioCtx.currentTime + (i * 0.125);
                    gainNode.gain.setValueAtTime(0.25, t);
                    gainNode.gain.setValueAtTime(0, t + 0.05);
                }
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 5);
            }
            else if (soundType === 'chime') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1500, audioCtx.currentTime);
                const osc2 = audioCtx.createOscillator(); // Add bright harmonic
                osc2.type = 'sine';
                osc2.frequency.setValueAtTime(4500, audioCtx.currentTime);
                osc2.connect(gainNode);

                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.6, audioCtx.currentTime + 0.02);
                gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 4);

                osc.start(audioCtx.currentTime);
                osc2.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 4);
                osc2.stop(audioCtx.currentTime + 4);
            }
            else if (soundType === 'siren') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                // Create sweeping wailing effect
                for (let i = 0; i < 10; i++) {
                    let t = audioCtx.currentTime + (i * 0.5);
                    osc.frequency.linearRampToValueAtTime(1200, t + 0.25);
                    osc.frequency.linearRampToValueAtTime(600, t + 0.5);
                }
                gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
                gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.1);
                gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime + 4.8);
                gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 5);

                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 5);
            }
        } catch (e) { console.warn('Audio Context Failed:', e); }
    }

    /**
     * Starts the countdown and increments subject study time.
     */
    function startTimer() {
        // Phase 1 Fix: Force-blur the editable timer to commit any manual changes
        if (document.activeElement === UI.timeDisplay) {
            UI.timeDisplay.blur();
        }
        // Catch manual edits that didn't trigger blur
        const rawText = UI.timeDisplay.textContent.trim();
        if (rawText) {
            let mins = 0, secs = 0;
            if (rawText.includes(':')) {
                const parts = rawText.split(':');
                mins = parseInt(parts[0]) || 0;
                secs = parseInt(parts[1]) || 0;
            } else {
                mins = parseInt(rawText) || 0;
            }
            const totalSecs = Math.max(1, (mins * 60) + secs);
            DURATION_MAP[State.currentMode] = totalSecs;
            times[State.currentMode] = totalSecs;
        }

        // Initialize Audio context on first user interaction to bypass browser policies
        if (!globalNeuralEngine || !globalNeuralEngine.isStarted) {
            globalNeuralEngine = new NeuralAudioEngine(State.currentMode === 'focus' ? 'focus' : 'relax');
        }

        if (State.isPlaying) return;
        State.isPlaying = true;

        // Both Focus and Break modes utilize the Dynamic Island for Neural Audio
        showDynamicIsland();
        if (!State.audioManuallyPaused) {
            globalNeuralEngine.start();
        }

        let lastTick = Date.now();

        State.timer = setInterval(() => {
            const nowTime = Date.now();
            let elapsed = Math.round((nowTime - lastTick) / 1000);
            if (elapsed < 1) return;
            
            lastTick = nowTime;
            
            if (elapsed > times[State.currentMode]) {
                elapsed = times[State.currentMode];
            }
            
            times[State.currentMode] -= elapsed;

            // Increment subject data during focus sessions
            if (State.currentMode === 'focus' && State.activeSubject && elapsed > 0) {
                subjectData[State.activeSubject] = (subjectData[State.activeSubject] || 0) + elapsed;

                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                if (!dailySubjectData[todayStr]) dailySubjectData[todayStr] = {};
                dailySubjectData[todayStr][State.activeSubject] = (dailySubjectData[todayStr][State.activeSubject] || 0) + elapsed;

                renderSubjectList(); // Visual live feedback
                
                State.focusSyncAcc = (State.focusSyncAcc || 0) + elapsed;
                if (State.focusSyncAcc >= 5) {
                    saveSubjects();
                    renderChart();
                    State.focusSyncAcc = 0;
                }
            }
            // Track break time internally
            else if ((State.currentMode === 'short' || State.currentMode === 'long') && elapsed > 0) {
                State.breakTime += elapsed;

                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                if (!dailySubjectData[todayStr]) dailySubjectData[todayStr] = {};
                dailySubjectData[todayStr]['__BREAKS__'] = (dailySubjectData[todayStr]['__BREAKS__'] || 0) + elapsed;

                State.breakSyncAcc = (State.breakSyncAcc || 0) + elapsed;
                if (State.breakSyncAcc >= 5) {
                    localStorage.setItem('pomodoroBreakTime', State.breakTime);
                    saveSubjects();
                    renderChart();
                    State.breakSyncAcc = 0;
                }
            }

            updateDisplay();

            if (times[State.currentMode] <= 0) {
                clearInterval(State.timer);
                State.isPlaying = false;
                if (globalNeuralEngine) globalNeuralEngine.stop();
                times[State.currentMode] = DURATION_MAP[State.currentMode];
                playAlarm();
                updateDisplay();
            }
        }, 1000);
    }

    /*
       (EASTER EGG)
         |\__/,|   (`\
       _.|o o  |_   ) )
     -(((---(((--------
       "Meow! Keep going, you're doing great!"
    */

    function pauseTimer() {
        clearInterval(State.timer);
        State.isPlaying = false;
        if (globalNeuralEngine) globalNeuralEngine.stop();
        if (UI.dynamicIsland && !UI.dynamicIsland.classList.contains('hidden')) {
            UI.dynamicIsland.classList.add('paused');
        }
    }

    function resetTimer() {
        clearInterval(State.timer);
        State.isPlaying = false;
        if (globalNeuralEngine) globalNeuralEngine.stop();
        hideDynamicIsland();
        times[State.currentMode] = DURATION_MAP[State.currentMode];
        updateDisplay();
    }


    // --------------------------------------------------------------------------
    //  [5] ANALYTICS & SUBJECT TRACKING
    // --------------------------------------------------------------------------

    /**
     * Persists subject and daily usage data to localStorage.
     */
    function saveSubjects() {
        localStorage.setItem('pomodoroSubjectData', JSON.stringify(subjectData));
        localStorage.setItem('pomodoroDailySubjectData', JSON.stringify(dailySubjectData));
    }

    /**
     * Formats raw seconds into a human-readable "Xh Ym Zs" string.
     */
    function formatMinutesAndSeconds(totalSeconds) {
        const mTotal = Math.floor(totalSeconds / 60);
        const h = Math.floor(mTotal / 60);
        const m = mTotal % 60;
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${mTotal}m ${s}s`;
    }

    /**
     * Filters daily log entries based on State.trackerRange.
     * @returns {object} { subjects: {}, breaks: number }
     */
    function getFilteredSubjectData() {
        if (State.trackerRange === 'all-time') {
            return { subjects: subjectData, breaks: State.breakTime };
        }

        let startDate = new Date();
        if (State.trackerRange === 'daily') {
            startDate.setHours(0, 0, 0, 0);
        } else if (State.trackerRange === 'weekly') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(startDate.setDate(diff));
            startDate.setHours(0, 0, 0, 0);
        } else if (State.trackerRange === 'monthly') {
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        } else if (State.trackerRange === 'yearly') {
            startDate.setMonth(0, 1);
            startDate.setHours(0, 0, 0, 0);
        } else if (State.trackerRange.startsWith('yearly-')) {
            const years = parseInt(State.trackerRange.split('-')[1]);
            startDate.setFullYear(startDate.getFullYear() - (years - 1));
            startDate.setMonth(0, 1);
            startDate.setHours(0, 0, 0, 0);
        }

        let filteredData = {};
        Object.keys(subjectData).forEach(sub => filteredData[sub] = 0);
        let filteredBreaks = 0;

        for (const [dateStr, subjects] of Object.entries(dailySubjectData)) {
            const [year, month, day] = dateStr.split('-');
            const recordDate = new Date(year, month - 1, day);
            if (recordDate >= startDate) {
                for (const [sub, secs] of Object.entries(subjects)) {
                    if (sub === '__BREAKS__') filteredBreaks += secs;
                    else filteredData[sub] = (filteredData[sub] || 0) + secs;
                }
            }
        }
        return { subjects: filteredData, breaks: filteredBreaks };
    }

    /*
       (EASTER EGG)
           ,___,
           (o,o)
          /)__)
          -"--"-
       "Wisely tracking your time..."
    */

    /**
     * Renders the interactive list of subjects in the sidebar.
     */
    function renderSubjectList() {
        UI.subjectList.innerHTML = '';
        const currentData = getFilteredSubjectData().subjects;
        const sortedSubjects = Object.keys(subjectData).sort((a, b) => a.localeCompare(b));

        for (let subj of sortedSubjects) {
            const div = document.createElement('div');
            div.className = 'subject-card';
            if (subj === State.activeSubject) div.classList.add('active');

            div.addEventListener('click', () => {
                State.activeSubject = subj;
                renderSubjectList();
            });

            const titleSpan = document.createElement('span');
            titleSpan.textContent = subj;
            titleSpan.style.flexGrow = '1';
            titleSpan.style.fontWeight = (subj === State.activeSubject) ? '600' : '400';
            titleSpan.style.fontSize = '1.1rem';

            const timeSpan = document.createElement('span');
            timeSpan.className = 'subject-time';
            timeSpan.textContent = formatMinutesAndSeconds(currentData[subj] || 0);

            const delBtn = document.createElement('button');
            delBtn.className = 'subject-delete';
            delBtn.innerHTML = "&times;";
            if (State.trackerRange !== 'all-time') delBtn.style.display = 'none';

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                delete subjectData[subj];
                if (State.activeSubject === subj) State.activeSubject = null;
                saveSubjects();
                renderSubjectList();
                renderChart();
            });

            div.appendChild(titleSpan);
            div.appendChild(timeSpan);
            div.appendChild(delBtn);
            UI.subjectList.appendChild(div);
        }
    }

    /**
     * Updates/Creates the Chart.js visualization for subject allocation.
     */
    function renderChart() {
        if (!UI.chartCanvas) return;

        const filtered = getFilteredSubjectData();
        const curSubjectData = filtered.subjects;
        const curBreaks = filtered.breaks;

        const labels = Object.keys(curSubjectData).filter(sub => curSubjectData[sub] > 0 || State.trackerRange === 'all-time');
        const dataVals = labels.map(sub => parseFloat((curSubjectData[sub] / 60).toFixed(2)));

        const chartLabels = [...labels, 'Total Breaks ☕'];
        const chartData = [...dataVals, parseFloat((curBreaks / 60).toFixed(2))];

        const chartColors = labels.map((_, i) => aestheticColors[Object.keys(subjectData).indexOf(labels[i]) % aestheticColors.length]);
        chartColors.push('rgba(215, 215, 215, 0.9)');

        if (State.pieChart && State.pieChart.config.type === State.mainChartType) {
            State.pieChart.data.labels = chartLabels;
            State.pieChart.data.datasets[0].data = chartData;
            State.pieChart.data.datasets[0].backgroundColor = chartColors;
            State.pieChart.data.datasets[0].borderRadius = State.mainChartType === 'bar' ? 8 : 0;
            State.pieChart.update();
        } else {
            if (State.pieChart) State.pieChart.destroy();
            State.pieChart = new Chart(UI.chartCanvas, {
                type: State.mainChartType,
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Study Time (min)',
                        data: chartData,
                        backgroundColor: chartColors,
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        borderRadius: State.mainChartType === 'bar' ? 8 : 0,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: State.mainChartType === 'pie' ? 'right' : 'top' },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    let mins = Math.round(context.raw);
                                    let h = Math.floor(mins / 60);
                                    let m = mins % 60;
                                    let str = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
                                    return context.label + ': ' + str;
                                }
                            }
                        }
                    },
                    scales: State.mainChartType === 'bar' ? { y: { beginAtZero: true } } : {}
                }
            });
        }
    }


    // --------------------------------------------------------------------------
    //  [6] CALENDAR & HOLIDAY LOGIC
    // --------------------------------------------------------------------------

    const movableHolidaysCache = {}; // Performance Optimization: Cache Easter calculations

    /**
     * Calculates Orthodox Easter date using Meeus's algorithm (Julian calendar offset).
     * @param {number} year 
     * @returns {Date}
     */
    function getOrthodoxEaster(year) {
        const a = year % 19;
        const b = year % 7;
        const c = year % 4;
        const d = (19 * a + 15) % 30;
        const e = (2 * c + 4 * b - d + 34) % 7;
        const month = Math.floor((d + e + 114) / 31);
        const day = ((d + e + 114) % 31) + 1;
        let easterDate = new Date(year, month - 1, day);
        easterDate.setDate(easterDate.getDate() + 13); // Julian to Gregorian conversion
        return easterDate;
    }

    /**
     * Derives movable holidays based on the Easter date for a given year.
     * @param {number} year 
     * @returns {object} { holidays: {}, namedays: {} }
     */
    function getMovableHolidays(year) {
        if (movableHolidaysCache[year]) return movableHolidaysCache[year];

        const easter = getOrthodoxEaster(year);
        const ts = easter.getTime();
        const dayMs = 24 * 60 * 60 * 1000;

        // Calculate offsets
        const cleanMonday = new Date(ts - 48 * dayMs + 12 * 60 * 60 * 1000);
        const goodFriday = new Date(ts - 2 * dayMs + 12 * 60 * 60 * 1000);
        const easterMonday = new Date(ts + 1 * dayMs + 12 * 60 * 60 * 1000);
        const holySpirit = new Date(ts + 50 * dayMs + 12 * 60 * 60 * 1000);

        // St. George's Day handling (shifts if before Easter)
        const george = new Date(year, 3, 23, 12, 0, 0);
        let actualGeorge = george;
        if (george.getTime() < easter.getTime()) {
            actualGeorge = new Date(ts + 1 * dayMs + 12 * 60 * 60 * 1000);
        }

        const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const res = {
            holidays: {
                [fmt(cleanMonday)]: "Καθαρά Δευτέρα",
                [fmt(goodFriday)]: "Μεγάλη Παρασκευή",
                [fmt(easter)]: "Κυριακή του Πάσχα",
                [fmt(easterMonday)]: "Δευτέρα του Πάσχα",
                [fmt(holySpirit)]: "Αγίου Πνεύματος"
            },
            namedays: {
                [fmt(actualGeorge)]: "Γεώργιος, Γεωργία",
                [fmt(new Date(ts - 7 * dayMs + 12 * 60 * 60 * 1000))]: "Βάιος, Βάια"
            }
        };

        movableHolidaysCache[year] = res;
        return res;
    }

    /*
       (EASTER EGG)
          _________
         /        /|
        /        / |
       /________/ /
       |  BOOK  |/
       '--------'
       "Knowledge is the key to progress."
    */

    const fixedHolidays = {
        "01-01": "Πρωτοχρονιά", "01-06": "Θεοφάνια", "03-25": "Εθνική Επέτειος", "05-01": "Εργατική Πρωτομαγιά",
        "08-15": "Κοίμηση της Θεοτόκου", "10-28": "Εθνική Επέτειος", "12-25": "Χριστούγεννα", "12-26": "Σύναξη της Θεοτόκου"
    };

    const fixedNameDays = {
        "01-01": "Βασίλειος, Βασιλική", "01-07": "Ιωάννης, Ιωάννα", "01-17": "Αντώνιος, Αντωνία", "01-18": "Αθανάσιος, Αθανασία",
        "02-10": "Χαράλαμπος, Χαρίκλεια", "04-23": "Γεώργιος, Γεωργία", "05-21": "Κωνσταντίνος, Ελένη", "06-29": "Πέτρος, Παύλος",
        "07-20": "Ηλίας", "07-26": "Παρασκευή", "08-15": "Μαρία, Παναγιώτης, Δέσποινα", "08-30": "Αλέξανδρος",
        "09-14": "Σταύρος, Σταυρούλα", "10-26": "Δημήτριος, Δήμητρα", "11-08": "Μιχαήλ, Γαβριήλ, Άγγελος", "11-30": "Ανδρέας",
        "12-06": "Νικόλαος, Νικολέτα", "12-12": "Σπυρίδων, Σπυριδούλα", "12-15": "Ελευθέριος, Ελευθερία", "12-25": "Χρήστος, Χριστίνα",
        "12-27": "Στέφανος, Στεφανία"
    };

    /**
     * Checks if a specific date falls within a recurring weekly schedule.
     */
    function isDateInSchedule(checkDateStr, startDateStr, weeks) {
        const [cy, cm, cd] = checkDateStr.split('-').map(Number);
        const [sy, sm, sd] = startDateStr.split('-').map(Number);
        const check = new Date(cy, cm - 1, cd);
        const start = new Date(sy, sm - 1, sd);
        if (check < start) return false;
        if (check.getDay() !== start.getDay()) return false;
        const diffWeeks = Math.round(Math.abs(check - start) / (1000 * 60 * 60 * 24)) / 7;
        return diffWeeks < weeks;
    }

    /**
     * Aggregates all events (custom, yearly, weekly) for a given date string.
     */
    function getDayCustomEvents(dateStr) {
        let events = [];
        if (userCustomEvents[dateStr]) userCustomEvents[dateStr].forEach(t => events.push({ type: 'single', title: t }));
        const monthDay = dateStr.substring(5);
        if (userYearlyEvents[monthDay]) userYearlyEvents[monthDay].forEach(t => events.push({ type: 'yearly', title: t }));

        for (const start in userWeeklySchedules) {
            userWeeklySchedules[start].forEach(sched => {
                if (isDateInSchedule(dateStr, start, sched.weeks)) {
                    events.push({ type: 'weekly', title: sched.title });
                }
            });
        }
        return events;
    }


    // --------------------------------------------------------------------------
    //  [7] UI RENDERING: CALENDARS & EVENTS
    // --------------------------------------------------------------------------

    /**
     * Renders the miniature sidebar calendar.
     */
    function renderCalendar() {
        const year = State.calendarDate.getFullYear();
        const month = State.calendarDate.getMonth();

        // Update Month/Year Header
        const headerEl = document.getElementById('month-year');
        if (headerEl) headerEl.textContent = `${greekMonths[month]} ${year}`;

        const daysContainer = document.getElementById('calendar-days');
        if (!daysContainer) return;
        daysContainer.innerHTML = '';

        // Grid Padding: Insert empty slots for previous month's tail
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'cal-day empty';
            daysContainer.appendChild(emptyDiv);
        }

        const movable = getMovableHolidays(year);
        const today = new Date();

        // Day Iteration Logic
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const fullDateStr = `${year}-${dateStr}`;

            const dayDiv = document.createElement('div');
            dayDiv.className = 'cal-day';
            dayDiv.textContent = day;
            dayDiv.dataset.date = fullDateStr;

            let tooltips = [];
            let isHoliday = false, isNameDay = false;

            // Check against fixed/movable holiday DBs
            if (fixedHolidays[dateStr]) { tooltips.push("🎉 " + fixedHolidays[dateStr]); isHoliday = true; }
            if (movable.holidays[dateStr]) { tooltips.push("🎉 " + movable.holidays[dateStr]); isHoliday = true; }

            // Name Day logic (with Easter-shift edge cases)
            let nDays = [];
            let skipGeorge = (dateStr === "04-23" && movable.namedays[dateStr] === undefined && new Date(year, 3, 23, 12).getTime() < getOrthodoxEaster(year).getTime());
            if (fixedNameDays[dateStr] && !skipGeorge) nDays.push(fixedNameDays[dateStr]);
            if (movable.namedays[dateStr]) nDays.push(movable.namedays[dateStr]);

            if (nDays.length > 0) { tooltips.push("🎈 Name day: " + nDays.join(" / ")); isNameDay = true; }

            // User-defined events
            const cEvents = getDayCustomEvents(fullDateStr);
            cEvents.forEach(c => tooltips.push("📌 " + c.title));

            // Visual markers for Today and Holidays
            if (isHoliday) dayDiv.classList.add('holiday');
            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                dayDiv.classList.add('today');
            }

            // Indicator Dots (Mini dots below date)
            const indicators = document.createElement('div');
            indicators.className = 'day-indicators';
            if (isHoliday) { const dot = document.createElement('div'); dot.className = 'day-event-dot holiday-dot'; indicators.appendChild(dot); }
            if (isNameDay) { const dot = document.createElement('div'); dot.className = 'day-event-dot nameday-dot'; indicators.appendChild(dot); }

            cEvents.forEach(c => {
                const dot = document.createElement('div');
                dot.className = c.type === 'single' ? 'day-event-dot custom-event-dot' : (c.type === 'yearly' ? 'day-event-dot yearly-dot' : 'day-event-dot schedule-dot');
                indicators.appendChild(dot);
            });

            if (indicators.children.length > 0) dayDiv.appendChild(indicators);
            if (tooltips.length > 0) dayDiv.title = tooltips.join(" | ");

            daysContainer.appendChild(dayDiv);
        }
        renderUpcomingEvents();
    }

    /*
       (EASTER EGG)
              \ _ /
            -= (_) =-
              /   \
       "The sun is shining, keep shining too!"
    */

    /**
     * Populates the 'Upcoming Events' scrollable list (90-day window).
     */
    function renderUpcomingEvents() {
        const list = document.getElementById('upcoming-events-list');
        if (!list) return;
        list.innerHTML = '';

        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let end = new Date(today);
        end.setDate(today.getDate() + 90);

        let currentYear = today.getFullYear();
        let nextYear = end.getFullYear();
        let movHolsCurrent = getMovableHolidays(currentYear);
        let movHolsNext = (nextYear > currentYear) ? getMovableHolidays(nextYear) : movHolsCurrent;

        // Iterate through next 90 days to extract relevant events
        for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const shortDateStr = `${month}-${day}`;

            let dayEvents = [];
            getDayCustomEvents(dateStr).forEach(c => dayEvents.push({ title: c.title, type: c.type }));

            let movHols = (year === currentYear) ? movHolsCurrent : movHolsNext;
            if (fixedHolidays[shortDateStr]) dayEvents.push({ title: fixedHolidays[shortDateStr], type: 'holiday' });
            if (movHols.holidays[shortDateStr]) dayEvents.push({ title: movHols.holidays[shortDateStr], type: 'holiday' });

            if (dayEvents.length > 0) {
                const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
                const niceDate = `${dayName}, ${d.getDate()} ${greekMonths[d.getMonth()].substring(0, 3)}`;

                dayEvents.forEach(ev => {
                    let dotColor = 'purple';
                    if (ev.type === 'weekly') dotColor = 'orange';
                    if (ev.type === 'yearly') dotColor = 'blue';
                    if (ev.type === 'holiday') dotColor = 'pink';

                    const li = document.createElement('li');
                    li.className = 'neo-list-item';
                    li.style.marginBottom = '8px';
                    li.innerHTML = `
                        <div class="event-dot ${dotColor}" style="min-width:10px; min-height:10px; margin-right: 12px; border-radius:50%;"></div>
                        <div style="display: flex; flex-direction: column; flex-grow: 1;">
                            <span style="font-size: 0.9rem; font-weight: 600; color: var(--primary-text);">${ev.title}</span>
                            <span style="font-size: 0.75rem; color: var(--muted-text); margin-top: 3px;">📅 ${niceDate}</span>
                        </div>
                    `;
                    list.appendChild(li);
                });
            }
        }
        if (list.children.length === 0) list.innerHTML = '<li style="text-align:center; color:#888; font-size:0.9rem; padding: 20px 0;">No events found in the next 3 months!</li>';
    }

    /**
     * Initializes the Neumorphic month/year custom dropdowns.
     */
    function initNeoSelectors() {
        const mDisplay = document.getElementById('neo-month-display');
        const yDisplay = document.getElementById('neo-year-display');
        const mMenu = document.getElementById('neo-month-menu');
        const yMenu = document.getElementById('neo-year-menu');
        if (!mDisplay || !mMenu || !yMenu) return;

        // Month Selector Population
        mMenu.innerHTML = '';
        greekMonths.forEach((m, idx) => {
            let item = document.createElement('div');
            item.className = 'neo-dropdown-item';
            item.dataset.value = idx;
            item.textContent = m;
            item.addEventListener('click', () => {
                State.neoCalDate.setMonth(idx);
                mMenu.classList.remove('active');
                renderNeoCalendar();
            });
            mMenu.appendChild(item);
        });

        // Year Selector Population (Range: Today +/- 10 years)
        if (yMenu) {
            yMenu.innerHTML = '';
            const curY = new Date().getFullYear();
            for (let y = curY - 10; y <= curY + 10; y++) {
                let item = document.createElement('div');
                item.className = 'neo-dropdown-item';
                item.dataset.value = y;
                item.textContent = y;
                item.addEventListener('click', () => {
                    State.neoCalDate.setFullYear(y);
                    yMenu.classList.remove('active');
                    renderNeoCalendar();
                });
                yMenu.appendChild(item);
            }
        }

        mDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            if (yMenu) yMenu.classList.remove('active');
            mMenu.classList.toggle('active');
        });

        if (yDisplay) {
            yDisplay.addEventListener('click', (e) => {
                e.stopPropagation();
                mMenu.classList.remove('active');
                if (yMenu) yMenu.classList.toggle('active');
            });
        }

        // Global click-away handler
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.neo-custom-dropdown')) {
                mMenu.classList.remove('active');
                if (yMenu) yMenu.classList.remove('active');
            }
        });
    }

    /**
     * Renders the primary Neumorphic calendar inside the Planner overlay.
     */
    function renderNeoCalendar() {
        const year = State.neoCalDate.getFullYear();
        const month = State.neoCalDate.getMonth();
        const mEl = document.getElementById('neo-month-display');
        const yEl = document.getElementById('neo-year-display');
        const container = document.getElementById('neo-calendar-days');
        if (!container) return;

        if (mEl) mEl.textContent = greekMonths[month] + ' ⌄';
        if (yEl) yEl.textContent = year + ' ⌄';

        const mMenu = document.getElementById('neo-month-menu');
        const yMenu = document.getElementById('neo-year-menu');
        if (mMenu) {
            Array.from(mMenu.children).forEach(el => el.classList.toggle('selected', parseInt(el.dataset.value) === month));
        }
        if (yMenu) {
            Array.from(yMenu.children).forEach(el => el.classList.toggle('selected', parseInt(el.dataset.value) === year));
        }

        container.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDay; i++) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'neo-cal-day empty';
            container.appendChild(emptyDiv);
        }

        const movable = getMovableHolidays(year);
        const today = new Date();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const fullDateStr = `${year}-${dateStr}`;

            const dayDiv = document.createElement('div');
            dayDiv.className = 'neo-cal-day';
            dayDiv.textContent = day;
            dayDiv.dataset.date = fullDateStr;

            let tooltips = [];
            let isEvent = (fixedHolidays[dateStr] || movable.holidays[dateStr]);
            let skipGeorge = (dateStr === "04-23" && movable.namedays[dateStr] === undefined && new Date(year, 3, 23, 12).getTime() < getOrthodoxEaster(year).getTime());
            let isNameDay = (fixedNameDays[dateStr] && !skipGeorge) || movable.namedays[dateStr];

            if (isEvent) tooltips.push('Holiday: ' + (fixedHolidays[dateStr] || movable.holidays[dateStr]));
            if (isNameDay) tooltips.push('Name day: ' + isNameDay);

            const cEvents = getDayCustomEvents(fullDateStr);
            cEvents.forEach(c => tooltips.push("📌 " + c.title));

            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                dayDiv.classList.add('today-neo');
            }

            if (tooltips.length > 0) {
                const indContainer = document.createElement('div');
                indContainer.className = 'event-dot-container';
                if (isEvent) indContainer.appendChild(Object.assign(document.createElement('div'), { className: 'event-dot pink' }));
                if (isNameDay) indContainer.appendChild(Object.assign(document.createElement('div'), { className: 'event-dot green' }));
                cEvents.forEach(c => {
                    const typeClass = c.type === 'single' ? 'purple' : (c.type === 'yearly' ? 'blue' : 'orange');
                    indContainer.appendChild(Object.assign(document.createElement('div'), { className: `event-dot ${typeClass}` }));
                });
                dayDiv.appendChild(indContainer);
                dayDiv.title = tooltips.join(" | ");
            }
            container.appendChild(dayDiv);
        }
    }

    // --------------------------------------------------------------------------
    //  [8] PLANNER WIDGETS: TODOS & WEATHER
    // --------------------------------------------------------------------------

    /**
     * Rebuilds the Todo list inside the Planner overlay.
     */
    function renderTodos() {
        const list = document.getElementById('todo-list');
        if (!list) return;
        list.innerHTML = '';
        neoTodos.forEach((t, i) => {
            const li = document.createElement('li');
            li.className = `neo-list-item ${t.done ? 'completed' : ''}`;
            li.innerHTML = `
                <input type="checkbox" class="neo-checkbox" ${t.done ? 'checked' : ''} data-index="${i}" data-action="toggle-todo">
                <span style="flex-grow:1; word-break: break-word;">${t.text}</span>
                <button class="neo-delete" data-index="${i}" data-action="delete-todo">&times;</button>
            `;
            list.appendChild(li);
        });
    }

    /**
     * Renders a short list (next 14 days) specifically for the Planner widget.
     */
    function renderEvents() {
        const list = document.getElementById('event-list');
        if (!list) return;
        list.innerHTML = '';

        let today = new Date();
        today.setHours(0, 0, 0, 0);
        let end = new Date(today);
        end.setDate(today.getDate() + 14); // 2-week window

        let currentYear = today.getFullYear();
        let nextYear = end.getFullYear();
        let movHolsCurrent = getMovableHolidays(currentYear);
        let movHolsNext = (nextYear > currentYear) ? getMovableHolidays(nextYear) : movHolsCurrent;

        let count = 0;
        for (let d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            const shortDateStr = `${month}-${day}`;

            let dayEvents = [];
            getDayCustomEvents(dateStr).forEach(c => dayEvents.push({ title: c.title, type: c.type }));

            let movHols = (year === currentYear) ? movHolsCurrent : movHolsNext;
            if (fixedHolidays[shortDateStr]) dayEvents.push({ title: fixedHolidays[shortDateStr], type: 'holiday' });
            if (movHols.holidays[shortDateStr]) dayEvents.push({ title: movHols.holidays[shortDateStr], type: 'holiday' });

            if (dayEvents.length > 0) {
                const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
                const niceDate = `${dayName}, ${day}/${month}`;

                dayEvents.forEach(ev => {
                    count++;
                    let dotColor = 'purple';
                    if (ev.type === 'weekly') dotColor = 'orange';
                    if (ev.type === 'yearly') dotColor = 'blue';
                    if (ev.type === 'holiday') dotColor = 'pink';

                    const li = document.createElement('li');
                    li.className = 'neo-list-item';
                    li.style.alignItems = 'flex-start';
                    li.innerHTML = `
                        <div class="event-dot ${dotColor}" style="margin-top: 5px;"></div>
                        <div style="display: flex; flex-direction: column; flex-grow:1; line-height: 1.2;">
                            <span style="font-weight: 600; color: #444; word-break: break-word; font-size: 0.85rem;">${ev.title}</span>
                            <span style="font-size: 0.75rem; color: #888; margin-top: 3px;">📅 ${niceDate}</span>
                        </div>
                    `;
                    list.appendChild(li);
                });
            }
        }
        if (count === 0) list.innerHTML = '<li class="neo-list-item" style="color:#888; justify-content:center;">No upcoming events! 😴</li>';
    }

    /*
       (EASTER EGG)
                 .       .
                / \     / \
               |   |   |   |
               |   |   |   |
               |   |   |   |
               |   |___|   |
               |           |
               |  ( ) ( )  |
               \           /
                \_________/
       "Rex says: Time to focus!"
    */

    /**
     * Fetches live weather data for Athens using Open-Meteo (API-key free).
     */
    async function fetchNeoWeather() {
        const tempEl = document.getElementById('weather-temp-now');
        if (!tempEl) return;

        // Update display name
        const locationEl = document.getElementById('weather-location');
        if (locationEl) locationEl.textContent = `${State.weatherCity} ⌄`;

        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${State.weatherLat}&longitude=${State.weatherLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
            const res = await fetch(url);
            const data = await res.json();
            const current = data.current;
            const daily = data.daily;

            tempEl.textContent = `${Math.round(current.temperature_2m)}°`;

            // New Extended Details
            const feelsLikeEl = document.getElementById('weather-feels-like');
            if (feelsLikeEl) feelsLikeEl.textContent = `${Math.round(current.apparent_temperature)}°`;

            const hlEl = document.getElementById('weather-hl');
            if (hlEl && daily) {
                hlEl.textContent = `H:${Math.round(daily.temperature_2m_max[0])}° L:${Math.round(daily.temperature_2m_min[0])}°`;
            }

            const rainEl = document.getElementById('weather-rain');
            if (rainEl) rainEl.textContent = `${current.precipitation} mm`;

            document.getElementById('weather-hum').textContent = `${current.relative_humidity_2m}%`;

            const windEl = document.getElementById('weather-wind');
            if (windEl) windEl.textContent = `${current.wind_speed_10m} km/h`;
            // Note: In original code there was a typo where it looked for 'wind-speed', it should be 'weather-wind'

            const code = current.weather_code;
            let icon = '🌤️';
            let desc = 'Clear';

            if (code === 0) { icon = '☀️'; desc = 'Sunny'; }
            else if (code >= 1 && code <= 3) { icon = '⛅'; desc = 'Partly Cloudy'; }
            else if (code >= 45 && code <= 48) { icon = '🌫️'; desc = 'Foggy'; }
            else if (code >= 51 && code <= 67) { icon = '🌧️'; desc = 'Rainy'; }
            else if (code >= 71 && code <= 77) { icon = '❄️'; desc = 'Snowing'; }
            else if (code >= 80 && code <= 82) { icon = '🌦️'; desc = 'Showers'; }
            else if (code >= 95) { icon = '⛈️'; desc = 'Thunderstorm'; }

            document.getElementById('weather-icon-dyn').textContent = icon;
            document.getElementById('weather-desc').textContent = desc;
        } catch (e) {
            console.error("Weather fetch failed:", e);
            document.getElementById('weather-desc').textContent = "Offline";
        }
    }

    // --------------------------------------------------------------------------
    //  [9] SYSTEM ACTIONS: WINDOW ANIMATOR — Scale + Suck Hybrid
    // --------------------------------------------------------------------------

    /*
     *  ╔══════════════════════════════════════════════════════════════╗
     *  ║           Scale + Suck Animation Architecture                ║
     *  ╠══════════════════════════════════════════════════════════════╣
     *  ║                                                              ║
     *  ║   MINIMIZE:                                                  ║
     *  ║   ┌──────────────┐    The window simultaneously:             ║
     *  ║   │              │    1. Scales down (1.0 → 0.05)            ║
     *  ║   │   WINDOW     │    2. Translates toward dock icon Y       ║
     *  ║   │              │    3. Bottom corners converge (suck)      ║
     *  ║   └──────────────┘    4. Opacity fades (1.0 → 0.0)           ║
     *  ║         ↓                                                    ║
     *  ║       ╱    ╲         clip-path: polygon() creates the        ║
     *  ║      ╱      ╲        trapezoid suck effect while the         ║
     *  ║     ▼        ▼       transform handles scale + translate     ║
     *  ║      [dock icon]                                             ║
     *  ║                                                              ║
     *  ║   RESTORE: reverse of the above                              ║
     *  ╚══════════════════════════════════════════════════════════════╝
     */

    const WindowAnimator = {
        DURATION: 500,           // ms — total animation length
        activeAnimations: {},    // track ongoing animations to prevent doubles

        /**
         * Easing: cubic-bezier approximation for a smooth decelerate curve.
         * @param {number} t - Progress 0..1
         * @returns {number} Eased value 0..1
         */
        easeInOutCubic(t) {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },

        /**
         * Gets the center coordinates of a dock icon for a given app.
         * @param {string} appId - 'calendar', 'timer', or 'tracker'
         * @returns {{ x: number, y: number }}
         */
        getDockTarget(appId) {
            const dockItem = document.querySelector(`.dock-item[data-app="${appId}"]`);
            if (dockItem) {
                const rect = dockItem.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
            // Fallback: center-bottom of screen
            return { x: window.innerWidth / 2, y: window.innerHeight - 40 };
        },

        /**
         * MINIMIZE ANIMATION
         * Runs a frame-by-frame Scale+Suck animation toward the dock, then
         * applies the .minimized class for layout collapse.
         *
         * @param {string} appId - 'calendar', 'timer', or 'tracker'
         * @param {Function} onComplete - Called after animation + collapse
         */
        minimize(appId, onComplete) {
            const el = document.getElementById('col-' + appId);
            if (!el || this.activeAnimations[appId]) return;

            // Snapshot BEFORE animation starts
            const startRect = el.getBoundingClientRect();
            const target = this.getDockTarget(appId);

            // The suck convergence factor: how much the bottom corners pinch
            // At progress=1, bottom corners are 10% of original width (near-convergence)
            const suckFactor = 0.9;  // 90% of half-width converges

            el.classList.add('animating');
            this.activeAnimations[appId] = true;

            const startTime = performance.now();
            const duration = this.DURATION;

            const animate = (now) => {
                const elapsed = now - startTime;
                const rawProgress = Math.min(elapsed / duration, 1);
                const p = this.easeInOutCubic(rawProgress);

                // --- SCALE: shrinks from 1.0 to 0.05 ---
                const scale = 1 - p * 0.95;

                // --- TRANSLATE Y: moves toward dock Y ---
                // Calculate how far down we need to go
                const deltaY = (target.y - startRect.top - startRect.height / 2) * p;

                // --- TRANSLATE X: drift toward dock X ---
                const currentCenterX = startRect.left + startRect.width / 2;
                const deltaX = (target.x - currentCenterX) * p * 0.3; // subtle X drift

                // --- SUCK: bottom corners converge via clip-path ---
                // Top stays at full width, bottom pinches inward
                // At p=0: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%) = full rect
                // At p=1: polygon(0% 0%, 100% 0%, ~55% 100%, ~45% 100%) = trapezoid
                const bottomInset = suckFactor * p * 50; // percentage from each side
                const clipPath = `polygon(
                    0% 0%,
                    100% 0%,
                    ${100 - bottomInset}% 100%,
                    ${bottomInset}% 100%
                )`;

                // --- OPACITY: fades out in the last 40% of the animation ---
                const opacity = rawProgress < 0.6 ? 1 : 1 - ((rawProgress - 0.6) / 0.4);

                // Apply all transforms in a single composite
                el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scale})`;
                el.style.clipPath = clipPath;
                el.style.opacity = opacity;

                if (rawProgress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Animation complete → collapse layout
                    el.classList.remove('animating');
                    el.classList.add('minimized');

                    // Clear inline animation styles (CSS class handles rest)
                    el.style.transform = '';
                    el.style.clipPath = '';
                    el.style.opacity = '';

                    delete this.activeAnimations[appId];
                    if (onComplete) onComplete();
                }
            };

            requestAnimationFrame(animate);
        },

        /**
         * RESTORE ANIMATION
         * Removes .minimized first (re-enters flex flow), then runs the
         * reverse Scale+Suck from collapsed state to full size.
         *
         * @param {string} appId - 'calendar', 'timer', or 'tracker'
         * @param {Function} onComplete - Called after animation completes
         */
        restore(appId, onComplete) {
            const el = document.getElementById('col-' + appId);
            if (!el || this.activeAnimations[appId]) return;

            const target = this.getDockTarget(appId);
            const suckFactor = 0.9;

            // Remove minimized so the element re-enters layout
            el.classList.remove('minimized');
            el.classList.add('animating');

            // Force layout recalc so we can read the FINAL position
            el.getBoundingClientRect();
            const endRect = el.getBoundingClientRect();

            // Start from dock position
            const startDeltaY = target.y - endRect.top - endRect.height / 2;
            const startDeltaX = (target.x - endRect.left - endRect.width / 2) * 0.3;

            // Set initial collapsed state
            el.style.transform = `translate(${startDeltaX}px, ${startDeltaY}px) scale(0.05)`;
            el.style.clipPath = `polygon(0% 0%, 100% 0%, ${100 - suckFactor * 50}% 100%, ${suckFactor * 50}% 100%)`;
            el.style.opacity = '0';

            this.activeAnimations[appId] = true;

            const startTime = performance.now();
            const duration = this.DURATION;

            const animate = (now) => {
                const elapsed = now - startTime;
                const rawProgress = Math.min(elapsed / duration, 1);
                const p = this.easeInOutCubic(rawProgress);

                // Everything reverses: p goes 0→1 but values go collapsed→full
                const scale = 0.05 + p * 0.95;
                const deltaY = startDeltaY * (1 - p);
                const deltaX = startDeltaX * (1 - p);
                const bottomInset = suckFactor * (1 - p) * 50;
                const clipPath = `polygon(0% 0%, 100% 0%, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`;

                // Opacity: fades IN during the first 40% of restore
                const opacity = rawProgress < 0.4 ? rawProgress / 0.4 : 1;

                el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${scale})`;
                el.style.clipPath = clipPath;
                el.style.opacity = opacity;

                if (rawProgress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Animation complete → clean up
                    el.classList.remove('animating');
                    el.style.transform = '';
                    el.style.clipPath = '';
                    el.style.opacity = '';

                    delete this.activeAnimations[appId];
                    if (onComplete) onComplete();
                }
            };

            // Start on next frame so the initial state renders
            requestAnimationFrame(() => requestAnimationFrame(animate));
        }
    };

    /**
     * Toggles an application window (minimize/restore) with Scale+Suck animation.
     * @param {string} appId - 'calendar', 'timer', or 'tracker'
     * @param {HTMLElement|null} el - The dock element that was clicked (for bounce)
     */
    function toggleApp(appId, el) {
        const appEl = document.getElementById('col-' + appId);
        const dotEl = document.getElementById('dot-' + appId);
        if (!appEl) return;

        const isMobile = window.innerWidth <= 1100;

        if (isMobile) {
            // --- MOBILE: single-panel mode ---
            const allCols = document.querySelectorAll('.col-app');
            const allDots = document.querySelectorAll('.dock-dot');
            
            // Deactivate all panels and dots
            allCols.forEach(col => col.classList.remove('mobile-active', 'minimized'));
            allDots.forEach(dot => dot.classList.remove('active'));
            
            // Activate the selected one
            appEl.classList.add('mobile-active');
            appEl.classList.remove('minimized');
            if (dotEl) dotEl.classList.add('active');
            
            // Bounce animation
            if (el) {
                el.classList.add('bouncing');
                setTimeout(() => el.classList.remove('bouncing'), 400);
            }
            
            // Scroll to top to see it
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // --- DESKTOP: original behavior ---
        if (appEl.classList.contains('minimized')) {
            if (el) el.classList.add('bouncing');
            WindowAnimator.restore(appId, () => {
                if (el) el.classList.remove('bouncing');
                if (dotEl) dotEl.classList.add('active');
            });
        } else {
            appEl.classList.remove('maximized');
            WindowAnimator.minimize(appId, () => {
                // dot stays active on minimize (still "open" in dock)
            });
        }
    }

    /**
     * Closes an application — minimizes with animation + deactivates dock dot.
     * @param {string} appId - 'calendar', 'timer', or 'tracker'
     */
    function closeApp(appId) {
        const appEl = document.getElementById('col-' + appId);
        const dotEl = document.getElementById('dot-' + appId);
        if (!appEl) return;

        appEl.classList.remove('maximized');
        WindowAnimator.minimize(appId, () => {
            setTimeout(() => { if (dotEl) dotEl.classList.remove('active'); }, 100);
        });
    }

    // --------------------------------------------------------------------------
    //  [10] MODAL MANAGEMENT: EVENT EDITING
    // --------------------------------------------------------------------------

    /**
     * Opens the Neumorphic modal for managing events on a specific day.
     * @param {string} dateStr - Key format: 'YYYY-MM-DD'
     */
    function openEventModal(dateStr) {
        const modal = document.getElementById('event-modal');
        if (!modal) return;

        modal.classList.add('visible');
        document.getElementById('event-date-input').value = dateStr;
        document.getElementById('event-title-input').value = '';

        // Reset custom select
        const typeSelect = document.getElementById('event-type-select');
        const typeDisplay = document.getElementById('neo-select-display');
        if (typeSelect) typeSelect.value = 'single';
        if (typeDisplay) typeDisplay.textContent = 'Single Event';

        document.getElementById('event-weeks-container').style.display = 'none';

        const listEl = document.getElementById('existing-events-list');
        if (listEl) {
            listEl.innerHTML = '';

            const [yearStr, monthStr, dayStr] = dateStr.split('-');
            const year = parseInt(yearStr);
            const shortDateStr = `${monthStr}-${dayStr}`;

            let allEvents = [];

            // Aggregate Holidays
            let movHols = getMovableHolidays(year);
            if (fixedHolidays[shortDateStr]) allEvents.push({ title: fixedHolidays[shortDateStr], type: 'holiday' });
            if (movHols.holidays[shortDateStr]) allEvents.push({ title: movHols.holidays[shortDateStr], type: 'holiday' });

            // Aggregate Name Days
            let skipGeorge = (shortDateStr === "04-23" && movHols.namedays[shortDateStr] === undefined && new Date(year, 3, 23, 12).getTime() < getOrthodoxEaster(year).getTime());
            if (fixedNameDays[shortDateStr] && !skipGeorge) allEvents.push({ title: fixedNameDays[shortDateStr], type: 'nameday' });
            if (movHols.namedays[shortDateStr]) allEvents.push({ title: movHols.namedays[shortDateStr], type: 'nameday' });

            // Aggregate User Events
            getDayCustomEvents(dateStr).forEach(ev => allEvents.push(ev));

            // DOM Construction for event items
            allEvents.forEach(ev => {
                const li = document.createElement('li');
                li.className = 'neo-list-item mb-0';
                li.style.padding = '8px 15px';

                let color = 'purple';
                let deleteBtnHTML = '';

                if (ev.type === 'single') color = 'purple';
                else if (ev.type === 'yearly') color = 'blue';
                else if (ev.type === 'weekly') color = 'orange';
                else if (ev.type === 'holiday') color = 'pink';
                else if (ev.type === 'nameday') color = 'green';

                if (['single', 'yearly', 'weekly'].includes(ev.type)) {
                    deleteBtnHTML = `<button class="neo-delete" data-action="delete-specific-event" data-date="${dateStr}" data-type="${ev.type}" data-title="${ev.title.replace(/"/g, '&quot;')}">&times;</button>`;
                }

                let prefix = '';
                if (ev.type === 'holiday') prefix = '🎉 ';
                else if (ev.type === 'nameday') prefix = '🎈 ';

                li.innerHTML = `
                    <div class="event-dot ${color}"></div>
                    <span style="flex-grow:1; font-size: 0.8rem;">${prefix}${ev.title}</span>
                    ${deleteBtnHTML}
                 `;
                listEl.appendChild(li);
            });

            if (allEvents.length === 0) {
                const li = document.createElement('li');
                li.className = 'neo-list-item mb-0';
                li.style.justifyContent = 'center';
                li.style.color = '#888';
                li.textContent = 'No events';
                listEl.appendChild(li);
            }
        }

        // Daily Analytics Chart
        renderDailyChart(dateStr);

        // Limit Enforcement (Max 10 user events per day)
        const lengthNow = getDayCustomEvents(dateStr).length;
        const saveBtn = document.getElementById('event-save-btn');
        if (saveBtn) {
            if (lengthNow >= 10) {
                saveBtn.style.opacity = '0.5';
                saveBtn.style.pointerEvents = 'none';
                saveBtn.textContent = 'Limit: 10 Events';
            } else {
                saveBtn.style.opacity = '1';
                saveBtn.style.pointerEvents = 'auto';
                saveBtn.textContent = 'Save';
            }
        }
    }

    /**
     * Renders a per-day subject breakdown chart in the Event Modal.
     */
    function renderDailyChart(dateStr) {
        const chartWrapper = document.getElementById('daily-chart-wrapper');
        const controls = document.getElementById('daily-chart-controls');
        const ctx = document.getElementById('dailyChart');
        if (!chartWrapper || !controls || !ctx) return;

        const dailyData = dailySubjectData[dateStr];
        if (dailyData && Object.keys(dailyData).length > 0) {
            chartWrapper.style.display = 'block';
            controls.style.display = 'flex';

            const labels = Object.keys(dailyData);
            const dataVals = Object.values(dailyData).map(v => parseFloat((v / 60).toFixed(2)));
            const chartColors = labels.map((_, i) => aestheticColors[i % aestheticColors.length]);

            if (State.dailyPieChart && State.dailyPieChart.config.type === State.dailyChartType) {
                State.dailyPieChart.data.labels = labels;
                State.dailyPieChart.data.datasets[0].data = dataVals;
                State.dailyPieChart.data.datasets[0].backgroundColor = chartColors;
                State.dailyPieChart.data.datasets[0].borderRadius = State.dailyChartType === 'bar' ? 8 : 0;
                State.dailyPieChart.update();
            } else {
                if (State.dailyPieChart) State.dailyPieChart.destroy();
                State.dailyPieChart = new Chart(ctx, {
                    type: State.dailyChartType,
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Focus Time (min)',
                            data: dataVals,
                            backgroundColor: chartColors,
                            borderWidth: 2,
                            borderColor: '#ecf0f3',
                            borderRadius: State.dailyChartType === 'bar' ? 8 : 0,
                            borderSkipped: false
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: State.dailyChartType === 'pie' ? 'right' : 'top', labels: { boxWidth: 10, font: { size: 10 } } },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        let mins = Math.round(context.raw);
                                        let h = Math.floor(mins / 60);
                                        let m = mins % 60;
                                        let str = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
                                        return context.label + ': ' + str;
                                    }
                                }
                            }
                        },
                        scales: State.dailyChartType === 'bar' ? { y: { beginAtZero: true } } : {}
                    }
                });
            }
        } else {
            chartWrapper.style.display = 'none';
            controls.style.display = 'none';
            if (State.dailyPieChart) {
                State.dailyPieChart.destroy();
                State.dailyPieChart = null;
            }
        }
    }

    /*
       (EASTER EGG)
           ( (
            ) )
          .---.
         |     |o
         '---'
       "Enjoy a cup of tea, you've earned it."
    */

    /**
     * Logic for deleting a specific event entry across different storage buckets.
     */
    function deleteSpecificEvent(dateStr, type, title) {
        if (type === 'single') {
            if (userCustomEvents[dateStr]) {
                userCustomEvents[dateStr] = userCustomEvents[dateStr].filter(t => t !== title);
                if (userCustomEvents[dateStr].length === 0) delete userCustomEvents[dateStr];
            }
        } else if (type === 'yearly') {
            const monthDay = dateStr.substring(5);
            if (userYearlyEvents[monthDay]) {
                userYearlyEvents[monthDay] = userYearlyEvents[monthDay].filter(t => t !== title);
                if (userYearlyEvents[monthDay].length === 0) delete userYearlyEvents[monthDay];
            }
        } else {
            // Weekly logic is broad - find matching schedule item
            for (const start in userWeeklySchedules) {
                let originalLength = userWeeklySchedules[start].length;
                userWeeklySchedules[start] = userWeeklySchedules[start].filter(sched => !((sched.title === title) && isDateInSchedule(dateStr, start, sched.weeks)));
                if (userWeeklySchedules[start].length !== originalLength) {
                    if (userWeeklySchedules[start].length === 0) delete userWeeklySchedules[start];
                    break;
                }
            }
        }
        localStorage.setItem('userCustomEvents', JSON.stringify(userCustomEvents));
        localStorage.setItem('userYearlyEvents', JSON.stringify(userYearlyEvents));
        localStorage.setItem('userWeeklySchedules', JSON.stringify(userWeeklySchedules));

        renderCalendar();
        renderNeoCalendar();
        renderEvents();
        openEventModal(dateStr);
    }

    // --------------------------------------------------------------------------
    //  [11] SYSTEM INITIALIZATION & EVENT LISTENERS
    // --------------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', () => {
        // --- 1. INITIAL RENDER PASS ---
        updateDisplay();
        renderSubjectList();
        renderChart();
        renderTodos();
        renderEvents();
        initNeoSelectors();
        renderCalendar();
        renderNeoCalendar();
        fetchNeoWeather();
        initAlarmSelector();
        // Auto-refresh weather every 3 hours (3 * 60 * 60 * 1000 = 10,800,000 ms)
        setInterval(fetchNeoWeather, 3 * 60 * 60 * 1000);

        // --- 1.5 ONBOARDING GUIDE ---
        const welcomeOverlay = document.getElementById('welcome-overlay');
        const btnWelcomeStart = document.getElementById('btn-welcome-start');
        
        if (!localStorage.getItem('hasSeenWelcome2')) {
            // Show overlay on first visit
            setTimeout(() => {
                if(welcomeOverlay) {
                    welcomeOverlay.classList.add('visible');
                    welcomeOverlay.setAttribute('aria-hidden', 'false');
                }
            }, 600); // Slight delay for aesthetic pop
        }

        if (btnWelcomeStart) {
            btnWelcomeStart.addEventListener('click', () => {
                localStorage.setItem('hasSeenWelcome2', 'true');
                welcomeOverlay.classList.remove('visible');
                welcomeOverlay.setAttribute('aria-hidden', 'true');
            });
        }

        // --- 1.6 DATA BACKUP / SYNC OVERLAY ---
        const syncOverlay = document.getElementById('sync-overlay');
        const btnSyncOpen = document.getElementById('btn-sync-open');
        const btnSyncClose = document.getElementById('btn-sync-close');
        const btnDataExport = document.getElementById('btn-data-export');
        const dataImportFile = document.getElementById('data-import-file');
        const syncMsg = document.getElementById('sync-msg');

        function showSyncMessage(text, color = '#2ea043') {
            if(!syncMsg) return;
            syncMsg.textContent = text;
            syncMsg.style.color = color;
            syncMsg.style.opacity = '1';
            setTimeout(() => { syncMsg.style.opacity = '0'; }, 3000);
        }

        if (btnSyncOpen && syncOverlay && btnSyncClose) {
            btnSyncOpen.addEventListener('click', () => {
                syncOverlay.classList.add('visible');
                syncOverlay.setAttribute('aria-hidden', 'false');
            });
            btnSyncClose.addEventListener('click', () => {
                syncOverlay.classList.remove('visible');
                syncOverlay.setAttribute('aria-hidden', 'true');
            });
        }

        if (btnDataExport) {
            btnDataExport.addEventListener('click', () => {
                const data = JSON.stringify(localStorage);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Aesthetic_Pomodoro_Backup_${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showSyncMessage("Backup downloaded successfully!");
            });
        }

        if (dataImportFile) {
            dataImportFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target.result);
                        let validKeys = 0;
                        for (const key in importedData) {
                            if (importedData.hasOwnProperty(key)) {
                                localStorage.setItem(key, importedData[key]);
                                validKeys++;
                            }
                        }
                        if (validKeys > 0) {
                            showSyncMessage("Data restored! Reloading...");
                            setTimeout(() => location.reload(), 1500);
                        } else {
                            showSyncMessage("File empty", "#ef4444");
                        }
                    } catch (err) {
                        showSyncMessage("Error: Invalid Backup File", "#ef4444");
                    }
                };
                reader.readAsText(file);
                e.target.value = '';
            });
        }

        // Minor delay to ensure CSS masks/gradients apply after layout stability
        setTimeout(() => applyBackground(), 50);

        // --- 1.7 MOBILE: Set default active panel ---
        if (window.innerWidth <= 1100) {
            const timerCol = document.getElementById('col-timer');
            if (timerCol) timerCol.classList.add('mobile-active');
        }

        // --- 2. CORE TIMER CONTROLS ---
        UI.startBtn.addEventListener('click', startTimer);
        UI.pauseBtn.addEventListener('click', pauseTimer);
        UI.resetBtn.addEventListener('click', resetTimer);
        UI.focusBtn.addEventListener('click', () => switchMode('focus'));
        UI.shortBtn.addEventListener('click', () => switchMode('short'));
        UI.longBtn.addEventListener('click', () => switchMode('long'));

        if (UI.islandToggleBtn) {
            UI.islandToggleBtn.addEventListener('click', () => {
                State.audioManuallyPaused = !State.audioManuallyPaused;
                if (State.audioManuallyPaused) {
                    if (globalNeuralEngine) globalNeuralEngine.stop();
                    UI.dynamicIsland.classList.add('paused');
                    document.getElementById('island-icon').textContent = '▶️';
                    document.querySelector('.island-subtitle').textContent = 'Generative Audio Paused';
                } else {
                    if (State.isPlaying) {
                        if (!globalNeuralEngine || !globalNeuralEngine.isStarted) {
                            globalNeuralEngine = new NeuralAudioEngine(State.currentMode === 'focus' ? 'focus' : 'relax');
                        }
                        globalNeuralEngine.start();
                    }
                    UI.dynamicIsland.classList.remove('paused');
                    document.getElementById('island-icon').textContent = '⏸️';
                    document.querySelector('.island-subtitle').textContent = 'Generative Audio Active';
                }
            });
        }

        if (UI.islandCloseBtn) {
            UI.islandCloseBtn.addEventListener('click', () => {
                if (globalNeuralEngine) globalNeuralEngine.stop();
                hideDynamicIsland();
                State.audioManuallyPaused = true;
            });
        }

        // --- 3. SUBJECT INPUT & ANALYTICS ---
        UI.subjectInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && UI.subjectInput.value.trim() !== "") {
                const val = UI.subjectInput.value.trim();
                if (!subjectData[val]) subjectData[val] = 0;
                State.activeSubject = val; // Set as active upon creation
                UI.subjectInput.value = "";
                saveSubjects();
                renderSubjectList();
                renderChart();
            }
        });

        // Tracker Range Dropdown (Glassmorphic)
        const trDisp = document.getElementById('tracker-time-display');
        const trMenu = document.getElementById('tracker-time-menu');
        if (trDisp && trMenu) {
            trDisp.addEventListener('click', (e) => {
                e.stopPropagation();
                trMenu.classList.toggle('active');
            });

            trMenu.querySelectorAll('.glass-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const val = item.dataset.value;
                    const text = item.textContent;

                    trMenu.querySelectorAll('.glass-dropdown-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');

                    trDisp.textContent = text;
                    trMenu.classList.remove('active');

                    if (State.trackerRange !== val) {
                        State.trackerRange = val;
                        renderSubjectList();
                        renderChart();
                    }
                });
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.glass-dropdown-wrapper')) trMenu.classList.remove('active');
            });
        }

        // --- 4. INTERACTIVE TIME DISPLAY (IN-SITU EDITING) ---
        UI.timeDisplay.addEventListener('focus', () => { if (State.isPlaying) pauseTimer(); });
        UI.timeDisplay.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); UI.timeDisplay.blur(); } });
        UI.timeDisplay.addEventListener('blur', () => {
            let raw = UI.timeDisplay.textContent.trim();
            let mins = 0, secs = 0;
            if (raw.includes(':')) {
                const parts = raw.split(':');
                mins = parseInt(parts[0]) || 0;
                secs = parseInt(parts[1]) || 0;
            } else mins = parseInt(raw) || 0;

            const totalSecs = Math.max(1, (mins * 60) + secs);
            DURATION_MAP[State.currentMode] = totalSecs;
            times[State.currentMode] = totalSecs;

            if (State.currentMode === 'focus') localStorage.setItem('pomodoroFocusDuration', totalSecs);
            updateDisplay();
        });

        // --- 5. CHART DISPLAY TOGGLES (with sliding indicator) ---
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('.chart-toggle');
            if (!target) return;

            const targetArea = target.dataset.target;
            const type = target.dataset.type;

            // Animate the sliding indicator
            const container = target.closest('.chart-toggle-container');
            if (container) {
                const slider = container.querySelector('.chart-toggle-slider');
                const buttons = Array.from(container.querySelectorAll('.chart-toggle'));
                const idx = buttons.indexOf(target);
                if (slider) {
                    if (idx === 0) slider.classList.remove('slide-right');
                    else slider.classList.add('slide-right');
                }
            }

            document.querySelectorAll(`.chart-toggle[data-target="${targetArea}"]`).forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');

            if (targetArea === 'main' && State.mainChartType !== type) {
                State.mainChartType = type;
                renderChart();
            } else if (targetArea === 'daily' && State.dailyChartType !== type) {
                State.dailyChartType = type;
                const dInput = document.getElementById('event-date-input');
                if (dInput && dInput.value) renderDailyChart(dInput.value);
            }
        });

        // --- 6. GLOBAL DYNAMIC ROUTER (EVENT DELEGATION) ---
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action], [data-app], [data-external]');
            if (!target) return;

            // Window Management
            if (target.dataset.action === 'close') closeApp(target.dataset.target);
            if (target.dataset.action === 'minimize') toggleApp(target.dataset.target, null);
            if (target.dataset.action === 'maximize') {
                const win = document.getElementById('col-' + target.dataset.target);
                if (win) win.classList.toggle('maximized');
            }

            // App Toggling
            if (target.dataset.app) toggleApp(target.dataset.app, target);

            // External Links with Bounce Effect
            if (target.dataset.external) {
                target.classList.add('bouncing');
                setTimeout(() => {
                    target.classList.remove('bouncing');
                    const urls = {
                        'spotify': 'https://open.spotify.com/playlist/0vvXsWCC9xrXsKd4Zsnsnl',
                        'gemini': 'https://gemini.google.com/app',
                        'chatgpt': 'https://chatgpt.com/'
                    };
                    window.open(urls[target.dataset.external], target.dataset.external, 'status=1,width=800,height=800');
                }, 600);
            }
            if (target.dataset.action === 'reload') location.reload();

            // Task Actions
            if (target.dataset.action === 'toggle-todo') {
                const idx = target.dataset.index;
                neoTodos[idx].done = !neoTodos[idx].done;
                localStorage.setItem('neo-todos', JSON.stringify(neoTodos));
                renderTodos();
            }
            if (target.dataset.action === 'delete-todo') {
                neoTodos.splice(target.dataset.index, 1);
                localStorage.setItem('neo-todos', JSON.stringify(neoTodos));
                renderTodos();
            }
            if (target.dataset.action === 'delete-specific-event') {
                deleteSpecificEvent(target.dataset.date, target.dataset.type, target.dataset.title);
            }
        });

        // --- 7. CALENDAR CLICK DELEGATION ---
        document.getElementById('calendar-days').addEventListener('click', (e) => {
            const cell = e.target.closest('.cal-day:not(.empty)');
            if (cell && cell.dataset.date) openEventModal(cell.dataset.date);
        });

        document.getElementById('neo-calendar-days').addEventListener('click', (e) => {
            const cell = e.target.closest('.neo-cal-day:not(.empty)');
            if (cell && cell.dataset.date) {
                document.querySelectorAll('#widget-neo-calendar .neo-cal-day').forEach(d => d.classList.remove('selected'));
                cell.classList.add('selected');
                openEventModal(cell.dataset.date);
            }
        });

        // Calendar Navigation
        document.getElementById('prev-month')?.addEventListener('click', () => { State.calendarDate.setMonth(State.calendarDate.getMonth() - 1); renderCalendar(); });
        document.getElementById('next-month')?.addEventListener('click', () => { State.calendarDate.setMonth(State.calendarDate.getMonth() + 1); renderCalendar(); });
        document.getElementById('btn-neo-prev-month')?.addEventListener('click', () => { State.neoCalDate.setMonth(State.neoCalDate.getMonth() - 1); renderNeoCalendar(); });
        document.getElementById('btn-neo-next-month')?.addEventListener('click', () => { State.neoCalDate.setMonth(State.neoCalDate.getMonth() + 1); renderNeoCalendar(); });

        // Overlay Controllers
        document.getElementById('btn-planner-open')?.addEventListener('click', () => document.getElementById('planner-overlay').classList.add('visible'));
        document.getElementById('btn-planner-close')?.addEventListener('click', () => document.getElementById('planner-overlay').classList.remove('visible'));
        document.getElementById('btn-event-modal-close')?.addEventListener('click', () => document.getElementById('event-modal').classList.remove('visible'));
        document.getElementById('btn-event-cancel')?.addEventListener('click', () => document.getElementById('event-modal').classList.remove('visible'));

        // --- 8. PLANNER ACTIONS ---
        document.getElementById('btn-add-neo-event')?.addEventListener('click', () => {
            const now = new Date();
            const ds = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            openEventModal(ds);
        });

        document.getElementById('btn-add-neo-todo')?.addEventListener('click', () => {
            const text = prompt("New Task:");
            if (text && text.trim() !== '') {
                neoTodos.push({ text: text.trim(), done: false });
                localStorage.setItem('neo-todos', JSON.stringify(neoTodos));
                renderTodos();
            }
        });

        document.getElementById('event-type-select')?.addEventListener('change', (e) => {
            document.getElementById('event-weeks-container').style.display = e.target.value === 'weekly' ? 'block' : 'none';
        });

        // Enter key on event title → triggers Save
        document.getElementById('event-title-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('event-save-btn')?.click();
            }
        });

        document.getElementById('event-save-btn')?.addEventListener('click', () => {
            const dateStr = document.getElementById('event-date-input').value;
            const type = document.getElementById('event-type-select').value;
            const title = document.getElementById('event-title-input').value.trim();
            if (!title) return alert('Please enter a title');

            if (getDayCustomEvents(dateStr).length >= 10) return;

            if (type === 'single') {
                if (!userCustomEvents[dateStr]) userCustomEvents[dateStr] = [];
                userCustomEvents[dateStr].push(title);
            } else if (type === 'yearly') {
                const monthDay = dateStr.substring(5);
                if (!userYearlyEvents[monthDay]) userYearlyEvents[monthDay] = [];
                userYearlyEvents[monthDay].push(title);
            } else {
                const weeks = parseInt(document.getElementById('event-weeks-input').value) || 1;
                if (!userWeeklySchedules[dateStr]) userWeeklySchedules[dateStr] = [];
                userWeeklySchedules[dateStr].push({ title, weeks });
            }

            localStorage.setItem('userCustomEvents', JSON.stringify(userCustomEvents));
            localStorage.setItem('userYearlyEvents', JSON.stringify(userYearlyEvents));
            localStorage.setItem('userWeeklySchedules', JSON.stringify(userWeeklySchedules));

            document.getElementById('event-modal').classList.remove('visible');
            renderCalendar(); renderNeoCalendar(); renderEvents();
        });

        document.getElementById('btn-neo-share')?.addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({ title: 'Aesthetic Pomodoro Pro', text: 'Check out my workspace setup!', url: window.location.href });
            } else alert('Sharing not supported on this browser.');
        });

        // --- Neo Custom Select Logic ---
        const neoSelectWrapper = document.getElementById('neo-select-wrapper');
        const neoSelectDisplay = document.getElementById('neo-select-display');
        const neoSelectOptions = document.getElementById('neo-select-options');
        const eventTypeHidden = document.getElementById('event-type-select');

        if (neoSelectWrapper && neoSelectDisplay && neoSelectOptions && eventTypeHidden) {
            neoSelectDisplay.addEventListener('click', () => {
                const isOpen = neoSelectOptions.style.display === 'block';
                neoSelectOptions.style.display = isOpen ? 'none' : 'block';
                neoSelectDisplay.classList.toggle('open', !isOpen);
                if (!isOpen) neoSelectOptions.classList.add('active'); // triggers blur backdrop if any
            });

            neoSelectOptions.addEventListener('click', (e) => {
                const li = e.target.closest('.glass-dropdown-item');
                if (!li) return;

                // Update active class
                neoSelectOptions.querySelectorAll('.glass-dropdown-item').forEach(item => item.classList.remove('active'));
                li.classList.add('active');

                // Update values
                const val = li.getAttribute('data-value');
                eventTypeHidden.value = val;
                neoSelectDisplay.textContent = li.textContent;

                // Close dropdown
                neoSelectOptions.style.display = 'none';
                neoSelectDisplay.classList.remove('open');

                // Trigger change event manually for event-weeks-container logic
                eventTypeHidden.dispatchEvent(new Event('change'));
            });

            document.addEventListener('click', (e) => {
                if (!neoSelectWrapper.contains(e.target)) {
                    neoSelectOptions.style.display = 'none';
                    neoSelectDisplay.classList.remove('open');
                }
            });
        }

        // --- Weather Location Search Logic ---
        const weatherLocDisplay = document.getElementById('weather-location');
        const weatherSearchContainer = document.getElementById('weather-search-container');
        const weatherCityInput = document.getElementById('weather-city-input');
        const weatherCityResults = document.getElementById('weather-city-results');

        if (weatherLocDisplay && weatherSearchContainer && weatherCityInput && weatherCityResults) {

            // 1. Click to edit
            weatherLocDisplay.addEventListener('click', () => {
                weatherLocDisplay.style.display = 'none';
                weatherSearchContainer.style.display = 'block';
                weatherCityInput.value = State.weatherCity;
                weatherCityInput.focus();
                weatherCityResults.style.display = 'none';
            });

            // 2. Click outside closes the search
            document.addEventListener('click', (e) => {
                const widget = document.getElementById('widget-weather');
                if (widget && !widget.contains(e.target) && weatherSearchContainer.style.display === 'block') {
                    weatherSearchContainer.style.display = 'none';
                    weatherLocDisplay.style.display = 'inline-block';
                }
            });

            // 3. Debounce Input & Fetch Geocoding Results
            let geocodeTimeout;
            weatherCityInput.addEventListener('input', () => {
                const query = weatherCityInput.value.trim();
                clearTimeout(geocodeTimeout);

                if (query.length < 2) {
                    weatherCityResults.style.display = 'none';
                    return;
                }

                geocodeTimeout = setTimeout(async () => {
                    try {
                        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
                        const res = await fetch(url);
                        const data = await res.json();

                        weatherCityResults.innerHTML = '';

                        if (data.results && data.results.length > 0) {
                            data.results.forEach(city => {
                                const li = document.createElement('li');
                                li.className = 'glass-dropdown-item';
                                // Display format: "Paris, Ile-de-France, France"
                                const parts = [city.name, city.admin1, city.country].filter(Boolean);
                                li.textContent = parts.join(', ');

                                li.addEventListener('click', () => {
                                    State.weatherCity = city.name;
                                    State.weatherLat = city.latitude;
                                    State.weatherLon = city.longitude;

                                    localStorage.setItem('weatherCity', city.name);
                                    localStorage.setItem('weatherLat', city.latitude);
                                    localStorage.setItem('weatherLon', city.longitude);

                                    weatherSearchContainer.style.display = 'none';
                                    weatherLocDisplay.style.display = 'inline-block';
                                    weatherLocDisplay.textContent = `${State.weatherCity} ⌄`;

                                    // Trigger weather refresh immediately
                                    fetchNeoWeather();
                                });
                                weatherCityResults.appendChild(li);
                            });
                            weatherCityResults.style.display = 'block';
                            // Ensure it has active style so it's visible with backdrop blur
                            weatherCityResults.classList.add('active');
                        } else {
                            const li = document.createElement('li');
                            li.style.padding = '10px 15px';
                            li.style.color = '#777';
                            li.style.fontSize = '0.85rem';
                            li.textContent = 'No cities found.';
                            weatherCityResults.appendChild(li);
                            weatherCityResults.style.display = 'block';
                            weatherCityResults.classList.add('active');
                        }
                    } catch (err) {
                        console.error('Geocoding failed:', err);
                    }
                }, 400); // 400ms debounce
            });

            // Alternatively, pressing Enter automatically selects the first result if available
            weatherCityInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (weatherCityResults.children.length > 0) {
                        weatherCityResults.firstElementChild.click();
                    }
                } else if (e.key === 'Escape') {
                    weatherSearchContainer.style.display = 'none';
                    weatherLocDisplay.style.display = 'inline-block';
                }
            });
        }

        // --- Weather Saved Locations Logic ---
        (function initSavedLocations() {
            /**
             * savedLocations array stored in localStorage.
             * Each entry: { name, lat, lon }
             */
            let savedLocations = JSON.parse(localStorage.getItem('weatherSavedLocations') || '[]');

            const saveBtn = document.getElementById('weather-save-btn');
            const savedBar = document.getElementById('weather-saved-bar');
            const savedList = document.getElementById('weather-saved-list');

            /** Persist and re-render the pills */
            function persistAndRender() {
                localStorage.setItem('weatherSavedLocations', JSON.stringify(savedLocations));
                renderPills();
            }

            /** Update the star appearance based on whether current city is saved */
            function updateStar() {
                if (!saveBtn) return;
                const isSaved = savedLocations.some(loc => loc.name === State.weatherCity);
                saveBtn.textContent = isSaved ? '★' : '☆';
                saveBtn.classList.toggle('saved', isSaved);
                saveBtn.title = isSaved ? 'Location already saved' : 'Save this location';
            }

            /** Render all saved pills */
            function renderPills() {
                if (!savedList || !savedBar) return;
                savedList.innerHTML = '';

                if (savedLocations.length === 0) {
                    savedBar.style.display = 'none';
                    return;
                }

                savedBar.style.display = 'block';

                savedLocations.forEach((loc, idx) => {
                    const pill = document.createElement('div');
                    pill.className = 'weather-saved-pill';
                    if (loc.name === State.weatherCity) pill.classList.add('active-pill');

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = loc.name;

                    // Switch to this city on click
                    nameSpan.addEventListener('click', () => {
                        State.weatherCity = loc.name;
                        State.weatherLat = loc.lat;
                        State.weatherLon = loc.lon;
                        localStorage.setItem('weatherCity', loc.name);
                        localStorage.setItem('weatherLat', loc.lat);
                        localStorage.setItem('weatherLon', loc.lon);
                        fetchNeoWeather();
                        renderPills();   // refresh active highlight
                        updateStar();
                    });

                    // Remove button
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'pill-remove';
                    removeBtn.textContent = '×';
                    removeBtn.title = 'Remove';
                    removeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        savedLocations.splice(idx, 1);
                        persistAndRender();
                        updateStar();
                    });

                    pill.appendChild(nameSpan);
                    pill.appendChild(removeBtn);
                    savedList.appendChild(pill);
                });

                updateStar();
            }

            /** Save button click */
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const alreadySaved = savedLocations.some(loc => loc.name === State.weatherCity);
                    if (alreadySaved) return; // do nothing if already saved

                    savedLocations.push({
                        name: State.weatherCity,
                        lat: State.weatherLat,
                        lon: State.weatherLon
                    });

                    // Animate the star briefly
                    saveBtn.style.transform = 'scale(1.4)';
                    setTimeout(() => saveBtn.style.transform = '', 250);

                    persistAndRender();
                    updateStar();
                });
            }

            // Initial render on load
            renderPills();
            updateStar();

            // Re-run star check after each weather fetch (city may have changed)
            const origFetch = window._origFetchNeoWeather || fetchNeoWeather;
            // Expose hook so fetchNeoWeather calls updateStar after each run
            const _patchedWeather = async function () {
                await fetchNeoWeather();
                renderPills();
                updateStar();
            };
            // Attach to interval override — just also call updateStar when planner opens
            document.getElementById('btn-planner-open')?.addEventListener('click', () => {
                setTimeout(() => { renderPills(); updateStar(); }, 100);
            });
        })();


        // --- 9. GLOBAL KEYBOARD HOOKS ---
        document.addEventListener('keydown', (e) => {
            // If typing in an input, ONLY allow Escape to blur the input and close modals
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                if (e.key === 'Escape') {
                    e.target.blur();
                    if (UI.islandCloseBtn && UI.dynamicIsland && !UI.dynamicIsland.classList.contains('hidden')) {
                        UI.islandCloseBtn.click();
                    }
                    const planner = document.getElementById('planner-overlay');
                    const eventModal = document.getElementById('event-modal');
                    if (eventModal && eventModal.classList.contains('visible')) eventModal.classList.remove('visible');
                    else if (planner && planner.classList.contains('visible')) planner.classList.remove('visible');
                }
                return;
            }

            if (e.code === 'Space') { e.preventDefault(); (State.isPlaying) ? pauseTimer() : startTimer(); }
            else if ((e.key === 'Enter' && e.shiftKey) || e.key.toLowerCase() === 'r') { e.preventDefault(); resetTimer(); }
            else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const modes = ['focus', 'short', 'long'];
                let idx = modes.indexOf(State.currentMode);
                idx = e.key === 'ArrowRight' ? (idx + 1) % modes.length : (idx - 1 + modes.length) % modes.length;
                switchMode(modes[idx]);
            }
            else if (e.key === '1') { e.preventDefault(); switchMode('focus'); }
            else if (e.key === '2') { e.preventDefault(); switchMode('short'); }
            else if (e.key === '3') { e.preventDefault(); switchMode('long'); }
            else if (e.key.toLowerCase() === 'p') {
                e.preventDefault();
                const planner = document.getElementById('planner-overlay');
                if (planner) {
                    if (planner.classList.contains('visible')) document.getElementById('btn-planner-close')?.click();
                    else document.getElementById('btn-planner-open')?.click();
                }
            }
            else if (e.key.toLowerCase() === 'm') {
                e.preventDefault();
                if (UI.islandToggleBtn) UI.islandToggleBtn.click();
            }
            else if (e.key.toLowerCase() === 's') {
                e.preventDefault();
                document.getElementById('btn-sync')?.click();
            }
            else if (e.key === 'Escape') {
                e.preventDefault();
                if (UI.islandCloseBtn && UI.dynamicIsland && !UI.dynamicIsland.classList.contains('hidden')) {
                    UI.islandCloseBtn.click();
                }
                const planner = document.getElementById('planner-overlay');
                const eventModal = document.getElementById('event-modal');
                if (eventModal && eventModal.classList.contains('visible')) eventModal.classList.remove('visible');
                else if (planner && planner.classList.contains('visible')) planner.classList.remove('visible');
            }
        });

        // --- 10. DRAG & DROP FOR NEUMORPHIC CARDS ---
        let draggedCard = null;
        document.querySelectorAll('.neo-card').forEach(card => {
            card.draggable = true;
            card.addEventListener('dragstart', (e) => {
                draggedCard = card;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => card.style.opacity = '0.5', 0);
            });
            card.addEventListener('dragend', () => {
                draggedCard = null;
                card.style.opacity = '1';
                document.querySelectorAll('.neo-card').forEach(c => c.classList.remove('drag-over'));
            });
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (card !== draggedCard) card.classList.add('drag-over');
            });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (draggedCard && draggedCard !== card) {
                    const container = card.parentElement;
                    const cards = Array.from(container.querySelectorAll('.neo-card'));
                    if (cards.indexOf(draggedCard) < cards.indexOf(card)) card.after(draggedCard);
                    else card.before(draggedCard);
                }
            });
        });

        /*
           (EASTER EGG)
                    .
                   / \
                  |   |
                  |   |
                 /     \
                |       |
                |_______|
                 /  |  \
                *   *   *
           "To the moon and back. Launching focus!"
        */

        // Real-time Clock Widget Loop
        setInterval(() => {
            const clk = document.getElementById('live-clock');
            const dt = document.getElementById('live-date');
            if (clk && dt && document.getElementById('planner-overlay').classList.contains('visible')) {
                const now = new Date();
                clk.textContent = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' });
                dt.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', year: 'numeric' });
            }
        }, 1000);

        // --- 11. EXTERNAL CALENDAR SYNC (HELIOS) ---
        const syncBtn = document.getElementById('btn-sync');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                let url = prompt("Enter your Helios Calendar Export URL:", localStorage.getItem('heliosSyncURL') || '');
                if (!url || !url.startsWith("http")) return;
                localStorage.setItem('heliosSyncURL', url);
                syncBtn.textContent = "...";

                fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url))
                    .then(res => res.text())
                    .then(text => {
                        let added = 0, current = {};
                        text.split(/\r\n|\n|\r/).forEach(line => {
                            if (line.startsWith('BEGIN:VEVENT')) current = {};
                            else if (line.startsWith('END:VEVENT') && current.sum && current.dt) {
                                if (!userCustomEvents[current.dt]) userCustomEvents[current.dt] = [];
                                if (!userCustomEvents[current.dt].includes(current.sum) && userCustomEvents[current.dt].length < 10) {
                                    userCustomEvents[current.dt].push(current.sum);
                                    added++;
                                }
                            } else if (line.startsWith('SUMMARY')) current.sum = line.split(':').slice(1).join(':').trim();
                            else if (line.startsWith('DTSTART')) { const m = line.match(/:(\d{4})(\d{2})(\d{2})/); if (m) current.dt = `${m[1]}-${m[2]}-${m[3]}`; }
                        });
                        alert(`Sync complete: ${added} new events added.`);
                        renderCalendar(); renderNeoCalendar();
                    })
                    .catch(() => alert("Sync Failed. Please check the URL."))
                    .finally(() => syncBtn.textContent = "Sync Link");
            });
        }
        // --- 12. MINESWEEPER OVERLAY GAME ---
        const msLevels = {
            beginner: { r: 9, c: 9, m: 10 },
            intermediate: { r: 16, c: 16, m: 40 },
            expert: { r: 16, c: 30, m: 99 }
        };
        let msGrid = [], msMode = 'reveal';
        let msRows = 9, msCols = 9, msMines = 10, msFlags = 0;
        let msTimerInterval = null, msTime = 0, msFirstClick = true, msGameOver = false;

        const elMsGrid = document.getElementById('ms-grid');
        const elMsTimer = document.getElementById('ms-timer');
        const elMsMinesCount = document.getElementById('ms-mines-count');
        const elMsDifficulty = document.getElementById('ms-difficulty');
        const elMsBtnAction = document.getElementById('ms-btn-action');

        function initMinesweeper() {
            if (!elMsDifficulty || !elMsGrid) return;
            const diff = msLevels[elMsDifficulty.value];
            msRows = diff.r; msCols = diff.c; msMines = diff.m;
            msFlags = 0; msTime = 0; msFirstClick = true; msGameOver = false;
            clearInterval(msTimerInterval);
            elMsTimer.textContent = '000';
            elMsMinesCount.textContent = msMines;
            msGrid = [];
            msMode = 'reveal';
            if (elMsBtnAction) elMsBtnAction.textContent = 'Mode: 👆 Reveal';
            document.getElementById('dot-minesweeper')?.classList.add('active');
            
            elMsGrid.dataset.diff = elMsDifficulty.value;
            elMsGrid.style.gridTemplateColumns = `repeat(${msCols}, 1fr)`;
            elMsGrid.innerHTML = '';
            
            for(let r=0; r<msRows; r++) {
                msGrid[r] = [];
                for(let c=0; c<msCols; c++) {
                    msGrid[r][c] = { isMine: false, neighborCount: 0, isRevealed: false, isFlagged: false };
                    const cell = document.createElement('div');
                    cell.className = 'ms-cell';
                    cell.dataset.r = r; cell.dataset.c = c;
                    cell.addEventListener('click', () => msHandleClick(r, c));
                    cell.addEventListener('contextmenu', (e) => { e.preventDefault(); msToggleFlag(r, c); });
                    elMsGrid.appendChild(cell);
                }
            }
        }

        function msPlaceMines(firstR, firstC) {
            let placed = 0;
            while(placed < msMines) {
                let r = Math.floor(Math.random() * msRows);
                let c = Math.floor(Math.random() * msCols);
                if(!msGrid[r][c].isMine && !(r === firstR && c === firstC)) {
                    msGrid[r][c].isMine = true;
                    placed++;
                }
            }
            for(let r=0; r<msRows; r++){
                for(let c=0; c<msCols; c++){
                    if(!msGrid[r][c].isMine) msGrid[r][c].neighborCount = msCalcNeighbors(r, c);
                }
            }
        }

        function msCalcNeighbors(r, c) {
            let count = 0;
            for(let dr=-1; dr<=1; dr++){
                for(let dc=-1; dc<=1; dc++){
                    let nr = r + dr, nc = c + dc;
                    if(nr>=0 && nr<msRows && nc>=0 && nc<msCols && msGrid[nr][nc].isMine) count++;
                }
            }
            return count;
        }

        function msStartTimer() {
            clearInterval(msTimerInterval);
            msTime = 0;
            let sweepStartTick = Date.now();
            msTimerInterval = setInterval(() => {
                const nowTime = Date.now();
                msTime = Math.round((nowTime - sweepStartTick) / 1000);
                elMsTimer.textContent = msTime.toString().padStart(3, '0');
            }, 1000);
        }

        function msHandleClick(r, c) {
            if(msGameOver || msGrid[r][c].isRevealed) return;

            if(msMode === 'flag') { msToggleFlag(r, c); return; }
            if(msGrid[r][c].isFlagged) return;

            if(msFirstClick) {
                msFirstClick = false;
                msPlaceMines(r, c);
                msStartTimer();
            }

            if(msGrid[r][c].isMine) {
                msGameOver = true;
                clearInterval(msTimerInterval);
                msRevealAll(true, r, c);
            } else {
                msFloodFill(r, c);
                msCheckWin();
            }
        }

        function msToggleFlag(r, c) {
            if(msGameOver || msGrid[r][c].isRevealed) return;
            const cellData = msGrid[r][c];
            const cellEl = elMsGrid.children[r * msCols + c];
            if(!cellData.isFlagged) {
                if(msFlags >= msMines) return;
                cellData.isFlagged = true;
                msFlags++;
                cellEl.classList.add('flagged');
                cellEl.textContent = '🚩';
            } else {
                cellData.isFlagged = false;
                msFlags--;
                cellEl.classList.remove('flagged');
                cellEl.textContent = '';
            }
            elMsMinesCount.textContent = msMines - msFlags;
            msCheckWin();
        }

        function msFloodFill(r, c) {
            if(r<0 || r>=msRows || c<0 || c>=msCols || msGrid[r][c].isRevealed || msGrid[r][c].isFlagged || msGrid[r][c].isMine) return;
            msGrid[r][c].isRevealed = true;
            const cellEl = elMsGrid.children[r * msCols + c];
            cellEl.classList.add('revealed');
            let n = msGrid[r][c].neighborCount;
            if(n > 0) {
                cellEl.dataset.mines = n;
                cellEl.textContent = n;
            } else {
                for(let dr=-1; dr<=1; dr++){
                    for(let dc=-1; dc<=1; dc++){
                        msFloodFill(r + dr, c + dc);
                    }
                }
            }
        }

        function msRevealAll(isLoss, hitR, hitC) {
            for(let r=0; r<msRows; r++){
                for(let c=0; c<msCols; c++){
                    const cellData = msGrid[r][c];
                    const cellEl = elMsGrid.children[r * msCols + c];
                    if(isLoss && cellData.isMine) {
                        cellEl.textContent = '💣';
                        cellEl.classList.add('revealed');
                        if(r === hitR && c === hitC) cellEl.classList.add('mine', 'mine-red');
                        else cellEl.classList.add('mine');
                    } else if (isLoss && !cellData.isMine && cellData.isFlagged) {
                        cellEl.textContent = '❌'; 
                    }
                }
            }
        }

        function msCheckWin() {
            let revealedCount = 0;
            for(let r=0; r<msRows; r++) {
                for(let c=0; c<msCols; c++) {
                    if(msGrid[r][c].isRevealed) revealedCount++;
                }
            }
            if(revealedCount === (msRows * msCols) - msMines) {
                msGameOver = true;
                clearInterval(msTimerInterval);
                msFlags = msMines;
                elMsMinesCount.textContent = 0;
                for(let r=0; r<msRows; r++) {
                    for(let c=0; c<msCols; c++) {
                        if(msGrid[r][c].isMine && !msGrid[r][c].isFlagged) {
                            msGrid[r][c].isFlagged = true;
                            const cellEl = elMsGrid.children[r * msCols + c];
                            cellEl.textContent = '🚩';
                            cellEl.classList.add('flagged');
                        }
                    }
                }
                const currentDiff = elMsDifficulty.value;
                msSaveScore(currentDiff, msTime);
                setTimeout(() => {
                    alert(`Συγχαρητήρια! 🎉\nΟλοκλήρωσες το επίπεδο ${currentDiff.toUpperCase()} σε ${msTime} δευτερόλεπτα!`);
                    msShowLeaderboard(currentDiff);
                }, 500);
            }
        }

        function msSaveScore(diff, time) {
            let scores = JSON.parse(localStorage.getItem('msHighScores') || '{"beginner":[],"intermediate":[],"expert":[]}');
            if(!scores[diff]) scores[diff] = [];
            scores[diff].push({ time: time, date: new Date().toLocaleDateString('el-GR') });
            scores[diff].sort((a,b) => a.time - b.time);
            scores[diff] = scores[diff].slice(0, 10);
            localStorage.setItem('msHighScores', JSON.stringify(scores));
        }

        function msShowLeaderboard(tabDiff = 'beginner') {
            const lb = document.getElementById('ms-leaderboard');
            const list = document.getElementById('ms-score-list');
            if(!lb || !list) return;
            
            document.querySelectorAll('.ms-tab-btn').forEach(btn => {
                btn.style.boxShadow = btn.dataset.msDiff === tabDiff ? 'inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff' : '';
            });

            const scores = JSON.parse(localStorage.getItem('msHighScores') || '{"beginner":[],"intermediate":[],"expert":[]}');
            const diffScores = scores[tabDiff] || [];
            
            list.innerHTML = '';
            if(diffScores.length === 0) {
                list.innerHTML = '<li style="text-align:center; padding: 20px; color:#777;">Δεν υπάρχουν χρόνοι ακόμα. Παίξε μία παρτίδα!</li>';
            } else {
                diffScores.forEach((s, idx) => {
                    const li = document.createElement('li');
                    li.className = 'neo-list-item';
                    li.style.flexDirection = 'row';
                    li.style.justifyContent = 'space-between';
                    li.innerHTML = `
                        <span><b style="color:#d62728;">#${idx+1}</b> &nbsp; ⏱️ ${s.time}s</span>
                        <span style="font-size: 0.8rem; color:#777;">${s.date}</span>
                    `;
                    list.appendChild(li);
                });
            }
            lb.style.display = 'flex';
        }

        document.getElementById('btn-minesweeper-open')?.addEventListener('click', () => {
            const overlay = document.getElementById('minesweeper-overlay');
            if(overlay) overlay.classList.add('visible');
            // Only initialize if there is no active game
            if(msGrid.length === 0 || msGameOver) {
                initMinesweeper();
            }
        });
        
        document.getElementById('btn-minesweeper-close')?.addEventListener('click', () => {
            const overlay = document.getElementById('minesweeper-overlay');
            if(overlay) overlay.classList.remove('visible');
            clearInterval(msTimerInterval);
            msGrid = []; // Destroy game state so it restarts next time
            document.getElementById('dot-minesweeper')?.classList.remove('active');
        });

        document.getElementById('btn-minesweeper-min')?.addEventListener('click', () => {
            const overlay = document.getElementById('minesweeper-overlay');
            if(overlay) overlay.classList.remove('visible');
        // Hides the window but leaves timer running and grid intact!
        });

        document.getElementById('ms-btn-scores')?.addEventListener('click', () => {
            msShowLeaderboard(elMsDifficulty ? elMsDifficulty.value : 'beginner');
        });

        document.getElementById('ms-close-leaderboard')?.addEventListener('click', () => {
            const lb = document.getElementById('ms-leaderboard');
            if(lb) lb.style.display = 'none';
        });

        document.querySelectorAll('.ms-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => msShowLeaderboard(e.target.dataset.msDiff));
        });

        document.getElementById('ms-btn-restart')?.addEventListener('click', initMinesweeper);

        // Custom Neumorphic Dropdown for Minesweeper Difficulty
        const msDiffWrapper = document.getElementById('ms-diff-wrapper');
        const msDiffDisplay = document.getElementById('ms-diff-display');
        const msDiffOptions = document.getElementById('ms-diff-options');
        
        if (msDiffWrapper && msDiffDisplay && msDiffOptions) {
            msDiffDisplay.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                msDiffOptions.classList.toggle('active');
            });
            
            msDiffOptions.querySelectorAll('.neo-dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    msDiffDisplay.querySelector('span').textContent = item.textContent;
                    if(elMsDifficulty) elMsDifficulty.value = item.dataset.value;
                    
                    msDiffOptions.querySelectorAll('.neo-dropdown-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    msDiffOptions.classList.remove('active');
                    initMinesweeper();
                });
            });

            document.addEventListener('click', (e) => {
                if (!msDiffWrapper.contains(e.target)) {
                    msDiffOptions.classList.remove('active');
                }
            });
        }

        elMsBtnAction?.addEventListener('click', () => {
            if(msMode === 'reveal') {
                msMode = 'flag';
                elMsBtnAction.textContent = 'Mode: 🚩 Flag';
            } else {
                msMode = 'reveal';
                elMsBtnAction.textContent = 'Mode: 👆 Reveal';
            }
        });
    });

})();
