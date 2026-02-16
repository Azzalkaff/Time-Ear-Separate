

// ═══════════════════════════════════
  //   UTILITY HELPERS
  // ═══════════════════════════════════
  function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }

  // ... di bawah function generateUUID() ...

  // ─── ADDED HELPER FUNCTIONS ───
  function extractYouTubeVideoId(url) {
    if (!url) return null;
    // Handle standard URL, short URL, and Piped/Invidious URLs
    const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[7].length === 11) ? match[7] : null;
  }

  function validateYouTubeUrl(url) {
    const id = extractYouTubeVideoId(url);
    if (id) {
      return { isValid: true, videoId: id, error: null };
    }
    return { isValid: false, videoId: null, error: 'URL YouTube tidak valid' };
  }
  // ──────────────────────────────

// ... lanjutkan ke function getStorage() ...

  function getStorage() {
    try {
      const raw = localStorage.getItem('flowforge_v1');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setStorage(data) {
    try { 
      localStorage.setItem('flowforge_v1', JSON.stringify(data)); 
    } catch (error) {
      // Handle storage quota exceeded
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        console.warn('Storage quota exceeded');
        // Try to clean up old data
        try {
          const currentData = getStorage();
          if (currentData?.sessions && currentData.sessions.length > 100) {
            // Keep only last 50 sessions
            currentData.sessions = currentData.sessions.slice(-50);
            localStorage.setItem('flowforge_v1', JSON.stringify(currentData));
            return;
          }
        } catch (e) {
          console.error('Failed to clean up storage:', e);
        }
        // If cleanup fails, show error to user (will be handled by UI)
        throw new Error('Storage penuh. Hapus beberapa data lama.');
      }
      console.error('Storage error:', error);
      throw error;
    }
  }

  function defaultData() {
    return {
      version: 'v1',
      user: {
        id: generateUUID(),
        preferences: {
          theme: 'dark',
          typography: 'minimalist',
          motion: 'normal',
          audio: { 
            enabled: true, 
            volume: 60, 
            type: 'brown',
            youtube: {
              savedLinks: [],
              defaultLinkId: null,
              loopMode: 'playlist' // 'one' atau 'playlist'
            }
          }, 
          sessionGoalMinutes: 25,
          shareDefaults: { showTimestamp: true, showXP: true }
        },
        stats: { totalSessions: 0, totalMinutes: 0, totalXP: 0, currentStreak: 0 }
      },
      missions: [],
      sessions: [],
      tasks: [],
      receipts: []
    };
  }
  
  // ═══════════════════════════════════
  //   WEB AUDIO SYSTEM (PRO QUALITY)
  // ═══════════════════════════════════
  let audioCtx = null;
  let noiseSource = null;
  let gainNode = null;
  let filterNode = null; 

  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playNoise(type, volume) {
    initAudioContext();
    if (noiseSource) stopNoiseImmediate();

    const bufferSize = audioCtx.sampleRate * 4; 
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'brown') {
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
      }
    } else {
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1); 
      }
    }

    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    filterNode = audioCtx.createBiquadFilter();
    gainNode = audioCtx.createGain();

    if (type === 'white') {
      filterNode.type = 'lowpass';
      filterNode.frequency.value = 1200; 
      filterNode.Q.value = 0.5; 
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime((volume / 100) * 0.15, audioCtx.currentTime + 1);
    } else {
      filterNode.type = 'lowpass';
      filterNode.frequency.value = 400; 
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume / 100, audioCtx.currentTime + 1);
    }

    noiseSource.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    noiseSource.start();
  }

  function stopNoise() {
    if (gainNode && audioCtx) {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.setValueAtTime(gainNode.gain.value, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
    }
    setTimeout(() => stopNoiseImmediate(), 550);
  }

  function stopNoiseImmediate() {
    try { 
      if (noiseSource) { 
      noiseSource.stop(); 
      noiseSource.disconnect();
      noiseSource = null; 
      }
      if (filterNode) { filterNode.disconnect(); filterNode = null; }
      if (gainNode) { gainNode.disconnect(); gainNode = null; }
    } catch(e) {}
  }

  function setNoiseVolume(vol) {
    if (gainNode && audioCtx) {
      const currentType = document.querySelector('.audio-select') ? document.querySelector('.audio-select').value : 'brown';
      const multiplier = currentType === 'white' ? 0.15 : 1.0;
      gainNode.gain.setTargetAtTime((vol / 100) * multiplier, audioCtx.currentTime, 0.1);
    }
  }
// ═══════════════════════════════════
  //   PIPED AUDIO SYSTEM (ROBUST FIX)
  // ═══════════════════════════════════
  let pipedAudio = new Audio();
  pipedAudio.crossOrigin = "anonymous";
  
  // State tracking global untuk sinkronisasi
  window.youtubePlayerIsPlaying = false; 

  // Error Handling & State Sync
  pipedAudio.addEventListener('playing', () => { 
      window.youtubePlayerIsPlaying = true;
      // Paksa update UI Alpine jika instance tersedia
      const app = document.querySelector('[x-data]');
      if (app && app.__x) app.__x.$data.youtubePlayer.isPlaying = true;
  });

  pipedAudio.addEventListener('pause', () => { 
      window.youtubePlayerIsPlaying = false;
      const app = document.querySelector('[x-data]');
      if (app && app.__x) app.__x.$data.youtubePlayer.isPlaying = false;
  });

  pipedAudio.addEventListener('ended', () => {
      window.youtubePlayerIsPlaying = false;
      if (typeof window.onFlowForgeVideoEnd === 'function') {
           window.onFlowForgeVideoEnd();
      }
  });

  pipedAudio.addEventListener('error', (e) => { 
      console.error("Audio Playback Error:", e);
      window.youtubePlayerIsPlaying = false;
      // Notifikasi user lewat Toast (perlu akses ke scope Alpine nanti)
      alert("Gagal memutar audio. Coba ganti lagu atau cek koneksi."); 
  });

  async function playPipedAudio(videoId, volume = 50) {
    if (!videoId) return false;

    // Set Volume
    pipedAudio.volume = Math.max(0, Math.min(100, volume)) / 100;

    // Cek apakah PipedService sudah terload
    if (typeof PipedService === 'undefined') {
        console.error("PipedService module missing!");
        alert("Modul Audio belum siap. Refresh halaman.");
        return false;
    }

    try {
        // Logic: Jika ID sama, PAUSED, dan SRC valid -> Resume
        // TAPI: YouTube stream URL cepat expired.
        // Best practice: Fetch ulang jika sudah dipause lama atau error.
        
        const isSameVideo = window.currentPipedId === videoId;
        
        if (isSameVideo && pipedAudio.src && !isNaN(pipedAudio.duration)) {
             if (pipedAudio.paused) {
                await pipedAudio.play();
                return true;
             }
             return true; // Sudah playing
        }

        // Fetch Fresh URL
        document.body.style.cursor = 'wait';
        
        // Matikan audio sebelumnya
        pipedAudio.pause();
        
        const streamData = await PipedService.getStreamUrl(videoId);
        
        document.body.style.cursor = 'default';

        if (!streamData || !streamData.url) throw new Error("Gagal mengambil stream audio");

        // Simpan ID & Update SRC
        window.currentPipedId = videoId;
        pipedAudio.src = streamData.url;
        
        // Penting untuk iOS/Safari: Load eksplisit
        pipedAudio.load(); 
        
        await pipedAudio.play();
        return true;

    } catch (error) {
        document.body.style.cursor = 'default';
        console.error("Playback Failed:", error);
        
        // Reset state
        window.currentPipedId = null;
        return false;
    }
  }

  function pausePipedAudio() {
      if (!pipedAudio.paused) {
          pipedAudio.pause();
          return true;
      }
      return false;
  }

  function stopPipedAudio() {
      pipedAudio.pause();
      pipedAudio.currentTime = 0;
      window.currentPipedId = null; 
      return true;
  }

  function setPipedVolume(volume) {
      pipedAudio.volume = Math.max(0, Math.min(100, volume)) / 100;
  }

  // ═══════════════════════════════════
  //   ALPINE DATA
  // ═══════════════════════════════════
  function flowForge() {
    return {
      // State
      activeScreen: 'ignition',
      missionInput: '',

      // Canvas State
      pan: { x: 0, y: 0 },
      isDraggingCanvas: false,
      dragData: { targetId: null, startX: 0, startY: 0, initialNodeX: 0, initialNodeY: 0 },
      isLinkMode: false,
      linkingState: { sourceId: null, mouseX: 0, mouseY: 0 },
      focusTaskId: null, // Visual highlight di bento
    
    sessionMode: 'open', // 'open' (Stopwatch) atau 'target' (Countdown)
      targetMinutes: 25,   // Default Pomodoro
    
      lockedState: 'empty', // empty | locking | locked
      currentMission: null,
      taskInput: '',
      draggedTask: null,
    
    addTagToInput(cat) {
        const tag = '#' + cat + ' ';
        // Append tag at the end (lebih natural untuk flow mengetik)
        this.taskInput = this.taskInput + tag;
        
        this.$nextTick(() => {
             if(this.$refs.bentoInput) this.$refs.bentoInput.focus();
        });
      },
    
    newTaskPriority: 'normal', // State untuk tombol toggle priority
      newTaskDuration: null,     // State untuk tombol toggle durasi

      // Session
      session: {
        isActive: false,
        isPaused: false,
    
    isFinished: false,
    
        startTime: null,
        pausedAt: null,
        elapsedSeconds: 0,
        timerInterval: null,
      },

      // Prefs
      prefs: {
        theme: 'dark',
        typography: 'minimalist',
        motion: 'normal',
        audio: { enabled: true, volume: 60, type: 'brown' },
        sessionGoalMinutes: 25,
      },

      // YouTube Player State
      youtubePlayer: {
        isReady: false,
        isPlaying: false,
        currentVideoId: null,
        currentVideoTitle: null,
        error: null
      },

      // Stats
      stats: { totalSessions: 0, totalMinutes: 0, totalXP: 0, currentStreak: 0 },

      // Tasks
      tasks: [],

      // Modals
      showReceiptModal: false,
      showSettingsModal: false,
      showYouTubeModal: false,

      // Piped Search State
      youtubeInput: {
        query: '',
        isSearching: false,
        results: [], // Array hasil pencarian
        error: null
      },

      // Receipt
      lastReceipt: {
        mission: '', durationMin: 0, xp: 0, focusLevel: 'SUSTAINED',
        endedAt: null, ariaAnnounce: '', sessionId: null
      },

      // Toasts
      toasts: [],

      // Suggestions
      suggestions: [
        'Selesaikan proposal klien',
        'Baca 2 chapter buku',
        'Coding fitur baru',
        'Riset kompetitor',
        'Review PR tim',
      ],
      suggestionIdx: 0,

      // ─── COMPUTED ───────────────────
      get activeTasks() {
        return this.tasks.filter(t => !t.completedAt);
      },

      get tasksByCategory() {
        const grouped = {};
        this.activeTasks.forEach(t => {
          const c = t.category || 'Umum';
          if (!grouped[c]) grouped[c] = [];
          grouped[c].push(t);
        });
        return Object.entries(grouped);
      },
      
      get uniqueCategories() {
         const cats = new Set(this.activeTasks.map(t => t.category).filter(c => c && c !== 'Umum'));
         return Array.from(cats);
      },

      get navIndicatorLeft() {
        return { ignition: 0, cockpit: 33.33, bento: 66.66 }[this.activeScreen] || 0;
      },

      // ─── INIT ───────────────────────
      init() {

        // Bridge: Menghubungkan event player native ke method Alpine
        window.onFlowForgeVideoEnd = () => {
           this.handleVideoEnd();
        };

        // Load from localStorage
        const data = getStorage() || defaultData();
        const p = data.user?.preferences || {};
        this.prefs = {
          theme:               p.theme              || 'dark',
          typography:          p.typography         || 'minimalist',
          motion:              p.motion             || 'normal',
          audio:               p.audio              || { enabled: true, volume: 60, type: 'brown' },
          sessionGoalMinutes:  p.sessionGoalMinutes || 25,
        };

        // Initialize YouTube audio structure if not exists (Data Migration)
        if (!this.prefs.audio.youtube) {
          this.prefs.audio.youtube = {
            savedLinks: [],
            defaultLinkId: null
          };
          // Save migrated structure
          this.savePrefs();
        }

        // Ensure savedLinks is an array
        if (!Array.isArray(this.prefs.audio.youtube.savedLinks)) {
          this.prefs.audio.youtube.savedLinks = [];
        }
        // Ensure all saved links have required fields (Data Migration)
        this.prefs.audio.youtube.savedLinks = this.prefs.audio.youtube.savedLinks.map(link => ({
          id: link.id,
          title: link.title || 'YouTube Video',
          // Hapus dependensi URL stream fisik di storage, cukup ID saja yang persisten
          url: `https://www.youtube.com/watch?v=${link.id}`, 
          thumbnail: link.thumbnail || `https://i.ytimg.com/vi/${link.id}/mqdefault.jpg`,
          duration: link.duration || null,
          addedAt: link.addedAt || new Date().toISOString(),
          playCount: link.playCount || 0
        }));

        // Validate defaultLinkId exists in savedLinks
        if (this.prefs.audio.youtube.defaultLinkId) {
          const defaultExists = this.prefs.audio.youtube.savedLinks.some(l => l.id === this.prefs.audio.youtube.defaultLinkId);
          if (!defaultExists) {
            this.prefs.audio.youtube.defaultLinkId = null;
          }
        }

        // Set default to first link if no default exists but links exist
        if (!this.prefs.audio.youtube.defaultLinkId && this.prefs.audio.youtube.savedLinks.length > 0) {
          this.prefs.audio.youtube.defaultLinkId = this.prefs.audio.youtube.savedLinks[0].id;
        }

        // Load current video if YouTube type is selected and default exists
        if (this.prefs.audio.type === 'youtube' && this.prefs.audio.youtube.defaultLinkId) {
          const defaultLink = this.prefs.audio.youtube.savedLinks.find(l => l.id === this.prefs.audio.youtube.defaultLinkId);
          if (defaultLink) {
            this.youtubePlayer.currentVideoId = defaultLink.id;
            this.youtubePlayer.currentVideoTitle = defaultLink.title;
          }
        }

        // Initialize Piped/YouTube state
        this.youtubePlayer = {
          isPlaying: false,
          currentVideoId: null,
          currentVideoTitle: null,
          error: null
        };
        
        // Auto-load default song if exists
        if (this.prefs.audio.type === 'youtube' && this.prefs.audio.youtube.defaultLinkId) {
           const defaultLink = this.prefs.audio.youtube.savedLinks.find(l => l.id === this.prefs.audio.youtube.defaultLinkId);
           if (defaultLink) {
              this.youtubePlayer.currentVideoId = defaultLink.id;
              this.youtubePlayer.currentVideoTitle = defaultLink.title;
           }
        }

        this.stats   = data.user?.stats   || { totalSessions: 0, totalMinutes: 0, totalXP: 0, currentStreak: 0 };
        this.tasks   = data.tasks         || [];

        // Check system motion preference
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && this.prefs.motion === 'normal') {
          this.prefs.motion = 'reduced';
        }

        // Load active mission
        const missions = data.missions || [];
        const activeMission = missions.find(m => m.status === 'active');
        if (activeMission) {
          this.currentMission = activeMission;
          this.lockedState = 'locked';
        }

        // Autofocus input on ignition
        this.$nextTick(() => {
          if (this.$refs.missionInput) {
            setTimeout(() => this.$refs.missionInput.focus(), 250);
          }
        });

        // Handle tab visibility (Background Play Support)
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden && this.session.isActive && !this.session.isPaused && this.session.startTime) {
            
            const now = Date.now();
            const realElapsed = Math.floor((now - this.session.startTime) / 1000);
            
            // Logic anti-lonjakan:
            if (!isNaN(realElapsed) && realElapsed > this.session.elapsedSeconds) {
               this.session.elapsedSeconds = realElapsed;
            }
          }
        });

        // ─── MIGRATION: Give coordinates to old tasks ───
        if (this.tasks.length > 0) {
           let needsSave = false;
           this.tasks.forEach(t => {
              if (t.x === undefined) {
                 // Random scatter agar tidak menumpuk
                 t.x = (Math.random() * 300) - 150 + (window.innerWidth / 2);
                 t.y = (Math.random() * 300) - 150 + (window.innerHeight / 2);
                 t.parentId = null; // Default tidak terhubung
                 needsSave = true;
              }
           });
           if (needsSave) this.saveTasks();
        }
        
        // Center canvas on start
        this.pan = { x: 0, y: 0 };

        // ─── TAMBAHAN: DETAK JANTUNG BENTO ───
        // Ini memastikan visualisasi Bento ikut "hidup" saat Timer berjalan
        setInterval(() => {
           if (this.session.isActive && !this.session.isPaused) {
               // Kita update sedikit variabel dummy untuk memancing re-render efek visual
               // (Misalnya efek glow yang berdenyut seiring waktu)
               this.session.elapsedSeconds = this.session.elapsedSeconds; 
           }
        }, 1000);
      }, // <--- JANGAN LUPA TANDA KOMA INI. INI WAJIB ADA.


      // Helper untuk membuat garis lengkung organik (Bezier Curve)
      getCurvePath(parentId, childX, childY) {
          const startX = this.getNodeX(parentId);
          const startY = this.getNodeY(parentId);
          const endX = childX + this.pan.x;
          const endY = childY + this.pan.y;

          // Kontrol point untuk kurva (membuat efek tali kendur/lengkung)
          // Semakin besar angka 0.5, semakin melengkung
          const cp1x = startX;
          const cp1y = startY + (endY - startY) * 0.5;
          const cp2x = endX;
          const cp2y = endY - (endY - startY) * 0.5;

          return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
      },

  
      // ─── NAVIGATION ─────────────────
      goToScreen(screen) {
        this.activeScreen = screen;
        if (screen === 'ignition' && !this.currentMission) {
          this.$nextTick(() => {
            if (this.$refs.missionInput) this.$refs.missionInput.focus();
          });
        }
      },

      // ─── MISSION ────────────────────
      lockMission() {
        const text = this.missionInput.trim();
        if (text.length < 3) return;
        this.lockedState = 'locking';

        setTimeout(() => {
          const mission = {
            id: generateUUID(),
            text,
            createdAt: new Date().toISOString(),
            status: 'active'
          };
          this.currentMission = mission;
          this.lockedState = 'locked';
          this.missionInput = '';

          // Save
          const data = getStorage() || defaultData();
          // Close previous active missions
          (data.missions || []).forEach(m => { if (m.status === 'active') m.status = 'abandoned'; });
          data.missions.push(mission);
          setStorage(data);

          this.showToast('Target dikunci! ', 'success', '');
          this.launchConfetti();
        }, 400);
      },

      resetMission() {
        this.lockedState = 'empty';
        this.currentMission = null;
        const data = getStorage() || defaultData();
        (data.missions || []).forEach(m => { if (m.status === 'active') m.status = 'abandoned'; });
        setStorage(data);
        this.$nextTick(() => {
          if (this.$refs.missionInput) this.$refs.missionInput.focus();
        });
      },

      // ─── SESSION ────────────────────
      startSession() {
        if (!this.currentMission) {
          this.showToast('Kunci misi dulu!', 'error', '⚠');
          this.goToScreen('ignition');
          return;
        }

        if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
          if (!audioCtx) initAudioContext();
          if (audioCtx.state === 'suspended') audioCtx.resume();
        }

        this.session.isActive = true;
        this.session.isPaused = false;
        this.session.isFinished = false;
    
        // Reset elapsed jika baru mulai
        if (!this.session.pausedAt) {
             this.session.elapsedSeconds = 0;
        }
        
        // Sync waktu mulai
        this.session.startTime = Date.now() - (this.session.elapsedSeconds * 1000);
        
        if (this.session.timerInterval) clearInterval(this.session.timerInterval);
        
        this.session.timerInterval = setInterval(() => {
          const now = Date.now();
          const diff = Math.floor((now - this.session.startTime) / 1000);
          this.session.elapsedSeconds = diff;

          // LOGIC BARU: Cek Target Waktu
          if (this.sessionMode === 'target') {
             const limit = this.targetMinutes * 60;
             const remaining = limit - this.session.elapsedSeconds;
             
             // Update Title dengan Sisa Waktu
             document.title = `⏳ ${this.formatElapsed(Math.max(0, remaining))} — FLOW FORGE`;

             // Auto Stop jika waktu habis
             if (remaining <= 0) {
                 this.stopSession(true); // true = session complete
                 this.showToast('Target Waktu Tercapai!', 'success', '🏆');
                 return;
             }
          } else {
             // Mode Open (Stopwatch)
             document.title = `▶ ${this.formatElapsed(this.session.elapsedSeconds)} — FLOW FORGE`;
          }

        }, 1000);

        if (this.prefs.audio.enabled) {
          try {
            if (this.prefs.audio.type === 'youtube') {
              // Try current video first, then default, then first available
              let videoId = this.youtubePlayer.currentVideoId;
              if (!videoId && this.prefs.audio.youtube?.defaultLinkId) {
                videoId = this.prefs.audio.youtube.defaultLinkId;
                const defaultLink = this.prefs.audio.youtube.savedLinks.find(l => l.id === videoId);
                if (defaultLink) {
                  this.youtubePlayer.currentVideoId = videoId;
                  this.youtubePlayer.currentVideoTitle = defaultLink.title;
                }
              }
              if (!videoId && this.prefs.audio.youtube?.savedLinks?.length > 0) {
                videoId = this.prefs.audio.youtube.savedLinks[0].id;
                const firstLink = this.prefs.audio.youtube.savedLinks[0];
                this.youtubePlayer.currentVideoId = videoId;
                this.youtubePlayer.currentVideoTitle = firstLink.title;
              }
              
              if (videoId) {
                playPipedAudio(videoId, this.prefs.audio.volume);
                this.youtubePlayer.isPlaying = true;
                // Increment play count
                const link = this.prefs.audio.youtube.savedLinks.find(l => l.id === videoId);
                if (link) {
                  link.playCount = (link.playCount || 0) + 1;
                }
              } else {
                this.showToast('Pilih video YouTube terlebih dahulu', 'error', '⚠');
              }
            } else {
              playNoise(this.prefs.audio.type, this.prefs.audio.volume);
            }
          } catch (e) { 
            console.warn("Audio error:", e); 
            this.showToast('Gagal memutar audio', 'error', '⚠');
          }
        }
        
        document.body.classList.add('session-active');
        this.showToast(this.sessionMode === 'target' ? 'Timer dimulai!' : 'Stopwatch dimulai!', 'success', '▶');
      },
    
    pauseSession() {
        if (!this.session.isActive) return;
        this.session.isPaused = true;
        clearInterval(this.session.timerInterval);
    
        // UPDATE: Ubah judul jadi Pause
    
        document.title = `⏸ ${this.formatElapsed(this.session.elapsedSeconds)} — FLOW FORGE`;
        if (this.prefs.audio.enabled) {
          if (this.prefs.audio.type === 'youtube') {
            pausePipedAudio();
            this.youtubePlayer.isPlaying = false;
          } else {
            stopNoise();
          }
        }
      },

      resumeSession() {
        this.session.isPaused = false;
       
        this.session.startTime  = Date.now() - (this.session.elapsedSeconds * 1000);
    
        this.session.timerInterval = setInterval(() => {
          this.session.elapsedSeconds++;
      
          // UPDATE: Tampilkan waktu di Tab Browser
          document.title = `▶ ${this.formatElapsed(this.session.elapsedSeconds)} — FLOW FORGE`;
        }, 1000);
    
    if (this.prefs.audio.enabled) {
          if (this.prefs.audio.type === 'youtube') {
            const videoId = this.youtubePlayer.currentVideoId;
            if (videoId) {
              playPipedAudio(videoId, this.prefs.audio.volume);
              this.youtubePlayer.isPlaying = true;
            }
          } else {
            playNoise(this.prefs.audio.type, this.prefs.audio.volume);
          }
        }
        this.dismissAllToasts();
      },

      stopSession(autoFinish = false) {
        clearInterval(this.session.timerInterval);
        
        // Hentikan Audio tapi jangan reset timer visual dulu
        this.session.isActive = false; 
        this.session.isPaused = false;
        this.session.isFinished = true; // Trigger mode Victory

        document.body.classList.remove('session-active');
        document.title = '✓ MISSION COMPLETE';
        
        // Stop audio based on type
        if (this.prefs.audio.type === 'youtube') {
          stopPipedAudio();
          this.youtubePlayer.isPlaying = false;
        } else {
          stopNoise();
        }

        // Kalkulasi Data
        const duration = this.session.elapsedSeconds;
        const durationMin = Math.floor(duration / 60);
        const xp = this.calculateXP(duration);
        const focusLevel = this.getFocusLevel(durationMin);

        // Update Stats Global
        this.stats.totalSessions++;
        this.stats.totalMinutes += durationMin;
        this.stats.totalXP += xp;

        // Save ke Storage (History)
        const sessionData = {
          id: generateUUID(),
          missionId: this.currentMission?.id,
          startedAt: new Date(Date.now() - duration * 1000).toISOString(),
          endedAt: new Date().toISOString(),
          durationSeconds: duration,
          xp,
          focusLevel
        };
        const data = getStorage() || defaultData();
        data.sessions = data.sessions || [];
        data.sessions.push(sessionData);
        data.user.stats = this.stats;
        setStorage(data);
        
        // Simpan data untuk tampilan victory
        this.lastReceipt = {
          mission: this.currentMission?.text || '',
          durationMin,
          xp,
          focusLevel
        };

        // Efek Visual
        this.launchConfetti();
        if(this.prefs.audio.enabled) {
            // Opsional: Anda bisa menambahkan sfx 'ting' disini jika ada file audio
        }
      },
    
    completeAndReset() {
        this.session.isFinished = false;
        this.session.elapsedSeconds = 0;
        this.resetMission(); // Balik ke Ignition (kosong)
        // atau gunakan this.goToScreen('ignition') jika ingin mempertahankan teks misi
      },

      // ─── AUDIO ──────────────────────
      toggleAudio() {
        if (!this.prefs.audio.enabled && this.session.isActive) {
          // Stop current audio based on type
          if (this.prefs.audio.type === 'youtube') {
            pausePipedAudio();
          } else {
            stopNoise();
          }
        } else if (this.prefs.audio.enabled && this.session.isActive) {
          // Play audio based on type
          if (this.prefs.audio.type === 'youtube') {
            const videoId = this.youtubePlayer.currentVideoId;
            if (videoId) {
              playPipedAudio(videoId, this.prefs.audio.volume);
            } else {
              this.showToast('Pilih video YouTube terlebih dahulu', 'error', '⚠');
            }
          } else {
            playNoise(this.prefs.audio.type, this.prefs.audio.volume);
          }
        }
        this.savePrefs();
      },

      // Helper baru untuk mendapatkan judul audio
      getAudioTitle() {
        if (this.prefs.audio.type === 'youtube') {
           // Jika ada judul video youtube, gunakan itu. Jika loading, tampilkan placeholder
           return this.youtubePlayer.currentVideoTitle || 'Memuat YouTube Audio...';
        } else if (this.prefs.audio.type === 'brown') {
           return '🌊 Deep Brown Noise';
        } else if (this.prefs.audio.type === 'white') {
           return '⚪ Soft White Noise';
        }
        return 'Audio Ready';
      },

      restartAudioIfPlaying() {
        this.savePrefs();
        if (this.session.isActive && this.prefs.audio.enabled) {
          if (this.prefs.audio.type === 'youtube') {
            const videoId = this.youtubePlayer.currentVideoId;
            if (videoId) {
              playPipedAudio(videoId, this.prefs.audio.volume);
            }
          } else {
            playNoise(this.prefs.audio.type, this.prefs.audio.volume);
          }
        }
      },

      handleAudioTypeChange() {
        if (this.prefs.audio.type === 'youtube') {
          // Open YouTube modal jika belum ada saved links atau user ingin menambah
          if (!this.prefs.audio.youtube?.savedLinks || this.prefs.audio.youtube.savedLinks.length === 0) {
            this.showYouTubeModal = true;
          } else {
            // Jika ada saved links, langsung play yang pertama atau default
            const defaultLink = this.prefs.audio.youtube.savedLinks.find(l => l.id === this.prefs.audio.youtube.defaultLinkId) 
                              || this.prefs.audio.youtube.savedLinks[0];
            if (defaultLink) {
              this.playYouTubeVideo(defaultLink.id, defaultLink.title);
            }
          }
        } else {
          // Switch dari YouTube ke noise
          if (this.session.isActive && this.prefs.audio.enabled) {
            stopPipedAudio();
            this.youtubePlayer.isPlaying = false;
            playNoise(this.prefs.audio.type, this.prefs.audio.volume);
          }
        }
        this.restartAudioIfPlaying();
      },

      updateAudioVolume() {
        if (this.prefs.audio.type === 'youtube') {
          setPipedVolume(Number(this.prefs.audio.volume));
        } else {
          setNoiseVolume(Number(this.prefs.audio.volume));
        }
        this.savePrefs();
      },

      // ─── YOUTUBE AUDIO ───────────────
      // Menggunakan helper global yang sudah kita definisikan di atas
      extractYouTubeVideoId(url) {
        return window.extractYouTubeVideoId(url) || extractYouTubeVideoId(url);
      },

      validateYouTubeUrl(url) {
        // Panggil helper global
        const result = validateYouTubeUrl(url); 
        if (!result.isValid) {
          this.youtubePlayer.error = result.error;
          this.showToast(result.error, 'error', '⚠');
        } else {
          this.youtubePlayer.error = null;
        }
        return result;
      },

       async playYouTubeVideo(videoId, title = null) {
        if (!videoId) {
          this.showToast('Video ID tidak valid', 'error', '⚠');
          return false;
        }

        // Set state UI loading/persiapan
        this.youtubePlayer.currentVideoId = videoId;
        this.youtubePlayer.currentVideoTitle = title || 'YouTube Audio';
        this.youtubePlayer.error = null;
        // Jangan set isPlaying = true dulu disini, tunggu audio load!

        // Increment play count (Logic statistik)
        if (this.prefs.audio.youtube?.savedLinks) {
          const link = this.prefs.audio.youtube.savedLinks.find(l => l.id === videoId);
          if (link) {
            link.playCount = (link.playCount || 0) + 1;
            if (!title && link.title) {
              this.youtubePlayer.currentVideoTitle = link.title;
            }
          }
        }

        // --- CORE FIX: Await hasil playPipedAudio ---
        const success = await playPipedAudio(videoId, this.prefs.audio.volume);
        
        if (success) {
          this.youtubePlayer.isPlaying = true;
          
          if (this.prefs.audio.type !== 'youtube') {
            // Switch audio type ke youtube
            this.prefs.audio.type = 'youtube';
            // Stop brown/white noise jika sedang jalan
            if (this.session.isActive) {
              stopNoise();
            }
          }
          this.savePrefs();
        } else {
          // Jika gagal (success = false), kembalikan state UI
          this.youtubePlayer.isPlaying = false;
          this.showToast('Gagal memutar (Stream Error/Network)', 'error', '⚠');
        }
        return success;
      },

      pauseYouTubeVideo() {
        const success = pausePipedAudio();
        if (success) {
          this.youtubePlayer.isPlaying = false;
        }
        return success;
      },

      stopYouTubeVideo() {
        const success = stopPipedAudio();
        if (success) {
          this.youtubePlayer.isPlaying = false;
        }
        return success;
      },

      // ─── PLAYLIST LOGIC ───
      toggleLoopMode() {
         const modes = ['playlist', 'one'];
         const current = this.prefs.audio.youtube.loopMode || 'playlist';
         const next = modes[(modes.indexOf(current) + 1) % modes.length];
         
         this.prefs.audio.youtube.loopMode = next;
         this.savePrefs();
         
         this.showToast(next === 'one' ? '🔂 Loop: Satu Lagu' : '🔁 Loop: Playlist', 'info');
      },

      playNextVideo() {
         const links = this.prefs.audio.youtube.savedLinks || [];
         if (links.length === 0) return;

         const currentId = this.youtubePlayer.currentVideoId;
         let currentIndex = links.findIndex(l => l.id === currentId);
         
         // Jika tidak ketemu atau di akhir, kembali ke awal (logic playlist standar)
         let nextIndex = (currentIndex + 1) % links.length;
         
         const nextVideo = links[nextIndex];
         this.playYouTubeVideo(nextVideo.id, nextVideo.title);
      },

      playPrevVideo() {
         const links = this.prefs.audio.youtube.savedLinks || [];
         if (links.length === 0) return;

         const currentId = this.youtubePlayer.currentVideoId;
         let currentIndex = links.findIndex(l => l.id === currentId);
         
         // Mundur satu, jika < 0 maka ke item terakhir
         let prevIndex = (currentIndex - 1 + links.length) % links.length;
         
         const nextVideo = links[prevIndex];
         this.playYouTubeVideo(nextVideo.id, nextVideo.title);
      },

      handleVideoEnd() {
         const mode = this.prefs.audio.youtube.loopMode || 'playlist';
         
         if (mode === 'one') {
             // Ulangi video yang sama
             // Kita panggil play lagi, karena API youtube akan stop saat ended
             if (this.youtubePlayer.currentVideoId) {
                 playPipedAudio(this.youtubePlayer.currentVideoId, this.prefs.audio.volume);
             }
         } else {
             // Pindah ke video selanjutnya
             this.playNextVideo();
         }
      },

      // ─── YOUTUBE LINKS MANAGEMENT ─────
      async fetchYouTubeVideoInfo(videoId) {
        try {
          // Use YouTube oEmbed API untuk mendapatkan info video
          const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (!response.ok) {
            throw new Error('Failed to fetch video info');
          }
          const data = await response.json();
          return {
            title: data.title,
            thumbnail: data.thumbnail_url,
            duration: null // oEmbed doesn't provide duration, akan diisi dari player API nanti
          };
        } catch (error) {
          console.warn('Error fetching video info:', error);
          return {
            title: 'YouTube Video',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            duration: null
          };
        }
      },

      async addYouTubeLink() {
        const url = this.youtubeInput.url.trim();
        if (!url) {
          this.youtubeInput.error = 'URL tidak boleh kosong';
          return;
        }

        this.youtubeInput.isValidating = true;
        this.youtubeInput.error = null;

        const validation = this.validateYouTubeUrl(url);
        if (!validation.isValid) {
          this.youtubeInput.isValidating = false;
          this.youtubeInput.error = validation.error;
          return;
        }

        const videoId = validation.videoId;

        // Check if link already exists
        if (!this.prefs.audio.youtube) {
          this.prefs.audio.youtube = { savedLinks: [], defaultLinkId: null };
        }

        const existingLink = this.prefs.audio.youtube.savedLinks.find(l => l.id === videoId);
        if (existingLink) {
          this.youtubeInput.isValidating = false;
          this.youtubeInput.error = 'Link sudah tersimpan';
          this.showToast('Link sudah ada di daftar', 'info', 'ℹ');
          return;
        }

        try {
          // Fetch video info
          const videoInfo = await this.fetchYouTubeVideoInfo(videoId);
          
          const newLink = {
            id: videoId,
            title: videoInfo.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: videoInfo.thumbnail,
            duration: videoInfo.duration,
            addedAt: new Date().toISOString(),
            playCount: 0
          };

          // Add to saved links
          if (!this.prefs.audio.youtube.savedLinks) {
            this.prefs.audio.youtube.savedLinks = [];
          }
          this.prefs.audio.youtube.savedLinks.push(newLink);

          // Set as default if it's the first link
          if (this.prefs.audio.youtube.savedLinks.length === 1) {
            this.prefs.audio.youtube.defaultLinkId = videoId;
          }

          // Clear input
          this.youtubeInput.url = '';
          this.youtubeInput.error = null;
          this.youtubeInput.isValidating = false;

          // Save preferences
          this.savePrefs();

          this.showToast('Link YouTube ditambahkan!', 'success', '✓');
        } catch (error) {
          console.error('Error adding YouTube link:', error);
          this.youtubeInput.error = 'Gagal menambahkan link. Coba lagi.';
          this.youtubeInput.isValidating = false;
          this.showToast('Gagal menambahkan link', 'error', '✕');
        }
      },

      // Search lagu menggunakan Piped API
      async searchSong() {
         if(!this.youtubeInput.query || !this.youtubeInput.query.trim()) return;
         
         this.youtubeInput.isSearching = true;
         this.youtubeInput.results = []; // Reset hasil sebelumnya
         
         // Panggil service Piped yang sudah dibuat di file terpisah
         const items = await PipedService.search(this.youtubeInput.query);
         
         this.youtubeInput.results = items;
         this.youtubeInput.isSearching = false;
      },
      // Menambahkan lagu dari hasil pencarian ke daftar simpan
      addFromSearch(item) {
         // Robust parsing untuk URL Piped (/watch?v=ID)
         let videoId = null;    
         if (item.url) {
             // Coba ambil dari parameter v
             try {
                const urlObj = new URL(item.url, 'https://youtube.com'); // Base dummy untuk parsing relative path
                videoId = urlObj.searchParams.get('v');
             } catch (e) {}
         }
         
         // Fallback manual jika URL helper gagal (misal format string aneh)
         if (!videoId && item.url) {
             const parts = item.url.split('v=');
             if (parts.length > 1) {
                 videoId = parts[1].split('&')[0];
             }
         }

         if (!videoId) {
            this.showToast('Gagal mengambil ID video', 'error');
            return;
         }

         const newLink = {
            id: videoId,
            title: item.title,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: item.thumbnail,
            duration: item.duration || 0, 
            addedAt: new Date().toISOString(),
            playCount: 0
         };

         // Pastikan array savedLinks ada
         if (!this.prefs.audio.youtube) this.prefs.audio.youtube = {};
         if (!this.prefs.audio.youtube.savedLinks) this.prefs.audio.youtube.savedLinks = [];
         
         // Cek duplikat agar tidak double
         if(this.prefs.audio.youtube.savedLinks.some(l => l.id === videoId)) {
             this.showToast('Lagu ini sudah ada di daftar!', 'info');
             return;
         }

         this.prefs.audio.youtube.savedLinks.push(newLink);
         
         // Jika ini lagu pertama, jadikan default otomatis
         if (!this.prefs.audio.youtube.defaultLinkId) {
            this.prefs.audio.youtube.defaultLinkId = videoId;
         }
            
         this.savePrefs();
         this.showToast('Lagu berhasil ditambahkan!', 'success', '🎵');
         
         // Bersihkan pencarian setelah berhasil menambah
         this.youtubeInput.query = '';
         this.youtubeInput.results = [];    
      },


      deleteYouTubeLink(videoId) {
        if (!this.prefs.audio.youtube?.savedLinks) return;

        const index = this.prefs.audio.youtube.savedLinks.findIndex(l => l.id === videoId);
        if (index === -1) return;

        const deleted = this.prefs.audio.youtube.savedLinks[index];
        
        // If deleting currently playing video, stop it
        if (this.youtubePlayer.currentVideoId === videoId) {
          this.stopYouTubeVideo();
          this.youtubePlayer.currentVideoId = null;
          this.youtubePlayer.currentVideoTitle = null;
          
          // Switch to noise if no other links
          if (this.prefs.audio.youtube.savedLinks.length === 1) {
            this.prefs.audio.type = 'brown';
            this.restartAudioIfPlaying();
          }
        }

        // Remove from saved links
        this.prefs.audio.youtube.savedLinks.splice(index, 1);

        // Update default if needed
        if (this.prefs.audio.youtube.defaultLinkId === videoId) {
          this.prefs.audio.youtube.defaultLinkId = this.prefs.audio.youtube.savedLinks.length > 0 
            ? this.prefs.audio.youtube.savedLinks[0].id 
            : null;
        }

        this.savePrefs();
        this.showToast('Link dihapus', 'success', '✓');
      },

      handleYouTubePaste(event) {
        // Auto-extract URL dari clipboard
        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        if (pastedText) {
          this.youtubeInput.url = pastedText;
          // Validate immediately
          this.$nextTick(() => {
            const validation = this.validateYouTubeUrl(pastedText);
            if (!validation.isValid) {
              this.youtubeInput.error = validation.error;
            }
          });
        }
      },

      formatDuration(seconds) {
        if (!seconds) return '';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
          return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
      },

      // ─── YOUTUBE DEFAULT LINK ──────────
      setDefaultYouTubeLink(videoId) {
        if (!this.prefs.audio.youtube?.savedLinks) {
          this.showToast('Tidak ada link tersimpan', 'error', '⚠');
          return;
        }

        const link = this.prefs.audio.youtube.savedLinks.find(l => l.id === videoId);
        if (!link) {
          this.showToast('Link tidak ditemukan', 'error', '⚠');
          return;
        }

        this.prefs.audio.youtube.defaultLinkId = videoId;
        this.savePrefs();
        this.showToast(`"${link.title}" diatur sebagai default`, 'success', '✓');
      },

      // ─── TIMER HELPERS ──────────────
      getTimerOffset() {
        const circ = 2 * Math.PI * 95;
        
        if (this.sessionMode === 'target') {
            // Mode Countdown: Lingkaran mengecil
            const totalSeconds = this.targetMinutes * 60;
            const progress = Math.min(this.session.elapsedSeconds / totalSeconds, 1);
            return circ * progress; // Offset bertambah = garis memendek
        } else {
            // Mode Open: Lingkaran berputar berdasarkan preferensi target visual (sessionGoalMinutes)
            const goal = this.prefs.sessionGoalMinutes * 60;
            const progress = Math.min(this.session.elapsedSeconds / goal, 1);
            return circ * (1 - progress); 
        }
      },

      formatElapsed(secs) {
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        return `${m}:${s}`;
      },

      // ─── XP / FOCUS ─────────────────
      calculateXP(durationSeconds) {
        const minutes = durationSeconds / 60;
        return Math.min(100, Math.round(minutes / 0.3));
      },

      getFocusLevel(durationMinutes) {
        if (durationMinutes < 20) return 'SUSTAINED';
        if (durationMinutes < 45) return 'DEEP';
        return 'EPIC';
      },

      getFocusEmoji(level) {
        return { SUSTAINED: '🔵', DEEP: '🟣', EPIC: '⚡' }[level] || '🔵';
      },

      //----- buat node -----------

      addNode() {
        const input = this.taskInput.trim();
        if (!input) return;
        
        let task = this.parseTaskInput(input);
        
        // POSISI: Random scatter center
        task.x = (window.innerWidth / 2) + (Math.random() * 60 - 30);
        task.y = (window.innerHeight / 2) + (Math.random() * 60 - 30);
        
        // --- ALGORITMA AUTO HIERARCHY ---
        // Jika task punya kategori spesifik (bukan 'Umum'), cari apakah sudah ada Node Induk untuk kategori itu?
        if (task.category && task.category !== 'Umum') {
            const parentNode = this.tasks.find(t => t.isCategoryNode && t.text === task.category);
            
            if (parentNode) {
                // Induk ditemukan, sambungkan
                task.parentId = parentNode.id;
            } else {
                // Induk belum ada, BUAT NODE INDUK BARU
                const newParent = {
                    id: generateUUID(),
                    text: task.category,
                    category: 'Meta', // Kategori khusus untuk induk
                    isCategoryNode: true, // Flag penanda
                    x: task.x - 50, // Muncul di dekat anak
                    y: task.y - 50,
                    createdAt: new Date().toISOString(),
                    parentId: null 
                };
                this.tasks.push(newParent);
                task.parentId = newParent.id; // Sambungkan anak ke induk baru
            }
        } else {
            // Jika tidak ada tag, sambungkan ke Matahari (Misi Utama) atau biarkan melayang (sesuai selera)
            // Di sini saya biarkan null agar melayang (floating idea), atau 'SUN' jika ingin terikat misi
            task.parentId = null; 
        }
        // -------------------------------
        
        this.tasks.push(task);
        this.taskInput = '';
        this.saveTasks();
        this.showToast('Ide ditambahkan', 'success', '💡');
      },

      parseTaskInput(input) {
        let task = {
          id:                generateUUID(),
          text:              input,
          category:          null,
          priority:          'normal',
          estimatedDuration: null,
          dueDate:           null,
          createdAt:         new Date().toISOString(),
          completedAt:       null,
        };

        const catMatch = input.match(/#(\w+)/);
        if (catMatch) {
          task.category = catMatch[1];
          task.text = task.text.replace(catMatch[0], '').trim();
        }

        if (input.includes('⚡') || input.includes('!urgent') || input.includes('!high')) {
          task.priority = 'high';
          task.text = task.text.replace(/⚡|!urgent|!high/g, '').trim();
        }

        const durMatch = input.match(/(\d+)(m|h)\b/);
        if (durMatch) {
          const v = parseInt(durMatch[1]);
          task.estimatedDuration = durMatch[2] === 'h' ? v * 60 : v;
          task.text = task.text.replace(durMatch[0], '').trim();
        }

        if (input.includes('!tomorrow')) {
          task.dueDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
          task.text = task.text.replace('!tomorrow', '').trim();
        }

        if (!task.category) task.category = 'Umum';
        return task;
      },

      completeTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        const prev = task.completedAt;
        task.completedAt = task.completedAt ? null : new Date().toISOString();
        this.saveTasks();
        this.showToast(task.completedAt ? 'Task selesai! ✓' : 'Task dibuka kembali', 'undo', '✓', 6000, () => {
          task.completedAt = prev;
          this.saveTasks();
        });
      },

      editTaskText(task) {
          const newText = prompt("Ubah isi task:", task.text);
          if (newText !== null && newText.trim() !== "") {
              task.text = newText.trim();
              
              // Opsional: Cek ulang hashtag jika user mengubah kategori lewat edit text
              // (Untuk simplifikasi kode HTML tunggal, kita update text saja dulu)
              
              this.saveTasks();
              this.showToast('Task diupdate', 'success', '✎');
          }
      },

      // BRIDGE: Jadikan node ini Misi Utama
      focusOnTask(task) {
        if (this.session.isActive && !this.session.isPaused) {
           this.showToast('Selesaikan sesi saat ini dulu!', 'error', '✋');
           return;
        }

        if (confirm(`Jadikan "${task.text}" sebagai Misi Utama?`)) {
            this.missionInput = task.text;
            this.lockMission(); // Kunci misi
            this.goToScreen('cockpit'); // Pindah ke timer
            this.showToast('Orbit dialihkan!', 'success', '🚀');
        }
      },

    deleteTask(id) {
        const idx = this.tasks.findIndex(t => t.id === id);
        if (idx === -1) return; 
        
        const [deleted] = this.tasks.splice(idx, 1);
        this.saveTasks();
        this.showToast('Task dihapus', 'undo', '↶', 6000, () => {
          if (idx >= this.tasks.length) this.tasks.push(deleted);
          else this.tasks.splice(idx, 0, deleted);
          this.saveTasks();
        });
      }, // <--- JANGAN LUPA KOMA INI! (Penyebab GUI Hilang)

      // Hapus seluruh kategori beserta isinya
      deleteCategory(catName) {
        if (!confirm(`Yakin ingin menghapus kategori #${catName} dan SEMUA task di dalamnya?`)) return;
        
        // Filter task yang BUKAN kategori ini (simpan sisanya)
        this.tasks = this.tasks.filter(t => t.category !== catName);
        this.saveTasks();
        this.showToast(`Kategori #${catName} dimusnahkan`, 'undo', '🗑');
      },

      // ─── FITUR BRIDGE: BENTO KE FLOW ───
      promoteTask(task) {
        // Cek apakah sesi sedang berjalan
        if (this.session.isActive && !this.session.isPaused) {
           this.showToast('Selesaikan sesi aktif terlebih dahulu!', 'error', '✋');
           return;
        }

        // Set teks task menjadi misi
        this.missionInput = task.text;
        
        // Simulasikan penguncian misi
        this.lockMission();
        
        // Pindah ke layar Flow
        this.goToScreen('cockpit');
        
        this.showToast('Fokus dialihkan ke task ini', 'success', '🚀');
      },

      // ─── FITUR DRAG & DROP BENTO ───
      handleDragStart(task) {
        this.draggedTask = task;
        // Efek visual dragging (opsional, browser menangani ini)
      },

      handleDragOver(e) {
        // Wajib preventDefault agar bisa di-drop
        e.preventDefault(); 
      },

      handleDrop(targetCategory) {
        if (!this.draggedTask) return;

        // Logika: Pindahkan kategori task
        // Cari task asli di array
        const taskIndex = this.tasks.findIndex(t => t.id === this.draggedTask.id);
        
        if (taskIndex > -1) {
          // Update kategori task ke kategori tujuan (targetCategory)
          this.tasks[taskIndex].category = targetCategory;
          this.saveTasks();
          this.showToast(`Pindah ke #${targetCategory}`, 'success', '📂');
        }

        this.draggedTask = null;
      },

      // Fungsi baru untuk klik kategori
      selectCategory(cat) {
        // Tambahkan spasi setelah hashtag agar rapi
        const tag = '#' + cat + ' '; 
        
        // Cek apakah input sudah ada isinya
        if (!this.taskInput) {
            this.taskInput = tag;
        } else if (!this.taskInput.includes(tag.trim())) {
           // Jika sudah ada teks lain, tambahkan di depan
           this.taskInput = tag + this.taskInput;
        }
        
        // Otomatis fokus ke input box agar user bisa langsung mengetik
        this.$nextTick(() => {
            // Kita cari elemen input manual karena x-ref kadang telat
            const inputEl = document.querySelector('.composer-input');
            if (inputEl) {
                inputEl.focus();
                // Opsional: Taruh kursor di paling akhir teks
                const len = inputEl.value.length;
                inputEl.setSelectionRange(len, len);
            }
        });
      }, // <--- Tambahkan koma di sini juga untuk jaga-jaga fungsi bawahnya

      // ─── CANVAS LOGIC ───
      
      startPan(e) {
         // Hanya pan jika yang diklik BENAR-BENAR canvas background
         // Cek apakah target atau parent terdekatnya memiliki class 'mind-node' atau 'bento-toolbar'
         if (e.target.closest('.mind-node') || e.target.closest('.bento-toolbar')) {
            return;
         }
         
         this.isDraggingCanvas = true;
         this.dragData.startX = e.clientX - this.pan.x;
         this.dragData.startY = e.clientY - this.pan.y;
      },

      startDragNode(e, task) {
         if (this.isLinkMode) return; // Jangan drag kalau sedang mode link
         this.dragData.targetId = task.id;
         this.dragData.startX = e.clientX;
         this.dragData.startY = e.clientY;
         this.dragData.initialNodeX = task.x;
         this.dragData.initialNodeY = task.y;
      },

      handleCanvasMove(e) {
         // 1. Pan Canvas
         if (this.isDraggingCanvas) {
            this.pan.x = e.clientX - this.dragData.startX;
            this.pan.y = e.clientY - this.dragData.startY;
            return;
         }

         // 2. Drag Node
         if (this.dragData.targetId) {
            const dx = e.clientX - this.dragData.startX;
            const dy = e.clientY - this.dragData.startY;
            const task = this.tasks.find(t => t.id === this.dragData.targetId);
            if (task) {
               task.x = this.dragData.initialNodeX + dx;
               task.y = this.dragData.initialNodeY + dy;
            }
         }
         
         // 3. Update Linking Line (Visual)
         if (this.linkingState.sourceId) {
             // Dapatkan posisi relatif terhadap SVG
             const rect = this.$refs.canvas.getBoundingClientRect();
             this.linkingState.mouseX = e.clientX - rect.left;
             this.linkingState.mouseY = e.clientY - rect.top;
         }
      },

      endDrag() {
         if (this.dragData.targetId) this.saveTasks(); // Simpan posisi baru
         this.isDraggingCanvas = false;
         this.dragData.targetId = null;
      },
      
      // ─── LINKING LOGIC ───
      toggleLinkMode() {
         this.isLinkMode = !this.isLinkMode;
         this.linkingState.sourceId = null;
         this.showToast(this.isLinkMode ? 'Mode Penghubung: Klik Parent lalu Child' : 'Mode Normal', 'info');
      },

      handleNodeClick(task) {
         // Logic Linking
         if (this.isLinkMode) {
             if (!this.linkingState.sourceId) {
                 this.linkingState.sourceId = task.id;
                 this.showToast('Pilih node tujuan...', 'info');
             } else {
                 if (this.linkingState.sourceId === task.id) return; // Tidak bisa link ke diri sendiri
                 
                 // Set Parent
                 task.parentId = this.linkingState.sourceId;
                 this.saveTasks();
                 
                 this.linkingState.sourceId = null;
                 this.isLinkMode = false; // Auto exit mode
                 this.showToast('Terhubung!', 'success', '🔗');
             }
             return;
         }
         
         // Normal Click (bisa untuk edit atau info, saat ini kosong)
      },

      // Helper untuk menggambar garis SVG
      getNodeX(id) {
          if (id === 'SUN') return this.pan.x + (window.innerWidth/2);
          const t = this.tasks.find(x => x.id === id);
          return t ? t.x + this.pan.x : 0;
      },
      
      getNodeY(id) {
          if (id === 'SUN') return this.pan.y + (window.innerHeight/2);
          const t = this.tasks.find(x => x.id === id);
          return t ? t.y + this.pan.y : 0;
      },
      
      autoArrange() {
          // Simple Circle Layout
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const radius = 150;
          const count = this.activeTasks.length;
          
          this.activeTasks.forEach((t, i) => {
              const angle = (i / count) * 2 * Math.PI;
              t.x = centerX + radius * Math.cos(angle) - this.pan.x; // Adjust relative to pan
              t.y = centerY + radius * Math.sin(angle) - this.pan.y;
          });
          this.pan = {x:0, y:0}; // Reset pan
          this.saveTasks();
      },
      
      saveTasks() {
        const data = getStorage() || defaultData();
        data.tasks = this.tasks;
        setStorage(data);
      },

      getCatColor(cat) {
        const palette = {
          'Dev':      '#BB86FC',
          'Design':   '#FFB74D',
          'Learning': '#03DAC6',
          'Work':     '#80CBC4',
          'Umum':     '#9E9E9E',
        };
        if (palette[cat]) return palette[cat];
        // Generate from hash
        let hash = 0;
        for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 65%)`;
      },

      // ─── EXPORT ─────────────────────
      async exportGrid() {
        const el = document.getElementById('bento-grid');
        if (!el || typeof html2canvas === 'undefined') {
          this.showToast('Export tidak tersedia', 'error', '⚠');
          return;
        }
        this.showToast('Membuat gambar…', 'info', '📸');
        try {
          const canvas = await html2canvas(el, { scale: 2, backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--color-surface-0').trim() || '#0e0e12' });
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `flow-grid-${new Date().toISOString().slice(0,10)}.png`;
          a.click();
          this.showToast('Grid tersimpan!', 'success', '✓');
        } catch (e) {
          this.showToast('Export gagal', 'error', '✕');
        }
      },

      async shareReceipt() {
        if (navigator.share) {
          navigator.share({ title: 'TIME EAR — Mission Done!', text: `✓ ${this.lastReceipt.mission} · ${this.lastReceipt.durationMin} menit · +${this.lastReceipt.xp} XP #FlowForge` });
        } else {
          await this.downloadReceipt();
        }
      },

      async downloadReceipt() {
        const el = document.getElementById('receipt-export-card');
        if (!el || typeof html2canvas === 'undefined') { this.showToast('Tidak tersedia', 'error', '⚠'); return; }
        try {
          const canvas = await html2canvas(el, { scale: 2, backgroundColor: null });
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `mission-${this.lastReceipt.mission.slice(0,20).replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.png`;
          a.click();
          this.showToast('Gambar tersimpan!', 'success', '✓');
        } catch { this.showToast('Gagal menyimpan', 'error', '✕'); }
      },

      // ─── SETTINGS ───────────────────
      openSettings() { this.showSettingsModal = true; },

      savePrefs() {
        try {
          const data = getStorage() || defaultData();
          data.user.preferences = { ...this.prefs };
          setStorage(data);
        } catch (error) {
          console.error('Failed to save preferences:', error);
          if (error.message && error.message.includes('Storage penuh')) {
            this.showToast('Storage penuh. Hapus beberapa link YouTube atau data lama.', 'error', '⚠');
          } else {
            this.showToast('Gagal menyimpan pengaturan', 'error', '✕');
          }
        }
      },

      // ─── TOAST ──────────────────────
      showToast(message, type = 'info', icon = 'ℹ', duration = 3000, undoFn = null) {
        const id = generateUUID();
        const iconMap = { success: '✓', error: '✕', info: 'ℹ', undo: '↶' };
        this.toasts.push({ id, message, type, icon: icon || iconMap[type] || 'ℹ', undoFn, leaving: false });
        if (duration > 0) {
          setTimeout(() => this.dismissToast(id), duration);
        }
        return id;
      },

      dismissToast(id) {
        const t = this.toasts.find(t => t.id === id);
        if (t) {
          t.leaving = true;
          setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== id);
          }, 200);
        }
      },

      dismissAllToasts() {
        this.toasts.forEach(t => this.dismissToast(t.id));
      },

      // ─── FORMATTERS ─────────────────
      formatDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      },

      formatTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      },

      formatDateTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      },

      // ─── CONFETTI ───────────────────
      launchConfetti() {
        if (this.prefs.motion === 'reduced') return;
        const container = document.getElementById('confetti-container');
        if (!container) return;
        const colors = ['#BB86FC', '#03DAC6', '#FFB74D', '#FF6B6B', '#80CBC4'];
        for (let i = 0; i < 30; i++) {
          const el = document.createElement('div');
          el.className = 'confetti-piece';
          el.style.cssText = `
            left: ${Math.random() * 100}%;
            top: -10px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            animation-delay: ${Math.random() * 0.8}s;
            animation-duration: ${1 + Math.random() * 1}s;
            transform: rotate(${Math.random() * 360}deg);
          `;
          container.appendChild(el);
          setTimeout(() => el.remove(), 2500);
        }
      },
    };
  }

  // Prevent Safari bounce
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest('.screen') || e.target.closest('.modal-sheet')) return;
    e.preventDefault();
  }, { passive: false });