// Messenger-style "Ling-Ping" crystal bell chime synthesizer using Web Audio API

let sharedAudioCtx: AudioContext | null = null;
let lastPlayedTimestamp = 0;
let unlockListenersAttached = false;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function attachAudioUnlockListeners() {
  if (unlockListenersAttached || typeof window === 'undefined') return;
  unlockListenersAttached = true;

  const unlock = () => {
    try {
      const ctx = getOrCreateAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore audio unlock errors
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

attachAudioUnlockListeners();

/**
 * Plays the signature Messenger "Ling-Ping" two-tone crystal chime notification sound.
 * - Note 1 ("Ling"): Crisp inflected E6 (987.77 Hz -> 1318.51 Hz) glass marimba strike
 * - Note 2 ("Ping"): Sparkling resonant B6 (1975.53 Hz) crystal bell chime + harmonic overtones
 */
export function playChatNotificationSound(force = false): void {
  try {
    const nowMs = Date.now();
    // Prevent overlapping double-triggers when both notification & chat listeners fire simultaneously
    if (!force && nowMs - lastPlayedTimestamp < 380) {
      return;
    }
    lastPlayedTimestamp = nowMs;

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const t0 = ctx.currentTime + 0.005;

    // Master output gain to keep peak clean and distortion-free
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.85, t0);
    masterGain.connect(ctx.destination);

    // =========================================================================
    // 1. "LING" (First Note at t0: E6 = 1318.51 Hz with subtle B5 -> E6 glide)
    // =========================================================================
    const lingFund = ctx.createOscillator();
    const lingHarm = ctx.createOscillator();
    const lingGain = ctx.createGain();
    const lingHarmGain = ctx.createGain();

    // Quick 14ms upward inflection (B5 -> E6) gives the crisp "ling" articulation
    lingFund.type = 'sine';
    lingFund.frequency.setValueAtTime(987.77, t0); // B5
    lingFund.frequency.exponentialRampToValueAtTime(1318.51, t0 + 0.014); // E6

    // Glassy 2nd harmonic (E7 = 2637.02 Hz)
    lingHarm.type = 'triangle';
    lingHarm.frequency.setValueAtTime(2637.02, t0);

    lingGain.gain.setValueAtTime(0.0001, t0);
    lingGain.gain.linearRampToValueAtTime(0.26, t0 + 0.004);
    lingGain.gain.exponentialRampToValueAtTime(0.09, t0 + 0.045);
    lingGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.135);

    lingHarmGain.gain.setValueAtTime(0.0001, t0);
    lingHarmGain.gain.linearRampToValueAtTime(0.085, t0 + 0.002);
    lingHarmGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);

    lingFund.connect(lingGain);
    lingHarm.connect(lingHarmGain);
    lingGain.connect(masterGain);
    lingHarmGain.connect(masterGain);

    lingFund.start(t0);
    lingFund.stop(t0 + 0.14);
    lingHarm.start(t0);
    lingHarm.stop(t0 + 0.06);

    // =========================================================================
    // 2. "PING" (Second Note at t0 + 0.092s: B6 = 1975.53 Hz crystal bell ring)
    // =========================================================================
    const tPing = t0 + 0.092;

    const pingFund = ctx.createOscillator();
    const pingSub = ctx.createOscillator();
    const pingOvertone = ctx.createOscillator();
    const pingClink = ctx.createOscillator();

    const pingFundGain = ctx.createGain();
    const pingSubGain = ctx.createGain();
    const pingOvertoneGain = ctx.createGain();
    const pingClinkGain = ctx.createGain();

    // Primary crystal bell fundamental (B6 = 1975.53 Hz)
    pingFund.type = 'sine';
    pingFund.frequency.setValueAtTime(1975.53, tPing);

    // Warm lower-octave body (B5 = 987.77 Hz) for fullness on all speakers
    pingSub.type = 'sine';
    pingSub.frequency.setValueAtTime(987.77, tPing);

    // Sparkling 2nd harmonic (B7 = 3951.07 Hz)
    pingOvertone.type = 'sine';
    pingOvertone.frequency.setValueAtTime(3951.07, tPing);

    // Inharmonic metallic bell strike transient (~5444 Hz) for authentic "ping" attack
    pingClink.type = 'sine';
    pingClink.frequency.setValueAtTime(5444.5, tPing);

    // Envelope for primary "Ping" resonance
    pingFundGain.gain.setValueAtTime(0.0001, tPing);
    pingFundGain.gain.linearRampToValueAtTime(0.34, tPing + 0.0035);
    pingFundGain.gain.exponentialRampToValueAtTime(0.14, tPing + 0.09);
    pingFundGain.gain.exponentialRampToValueAtTime(0.0001, tPing + 0.58);

    // Envelope for warm sub-octave body
    pingSubGain.gain.setValueAtTime(0.0001, tPing);
    pingSubGain.gain.linearRampToValueAtTime(0.11, tPing + 0.004);
    pingSubGain.gain.exponentialRampToValueAtTime(0.0001, tPing + 0.28);

    // Envelope for sparkling 2nd harmonic
    pingOvertoneGain.gain.setValueAtTime(0.0001, tPing);
    pingOvertoneGain.gain.linearRampToValueAtTime(0.095, tPing + 0.002);
    pingOvertoneGain.gain.exponentialRampToValueAtTime(0.0001, tPing + 0.14);

    // Envelope for crisp glass clink attack
    pingClinkGain.gain.setValueAtTime(0.0001, tPing);
    pingClinkGain.gain.linearRampToValueAtTime(0.06, tPing + 0.0015);
    pingClinkGain.gain.exponentialRampToValueAtTime(0.0001, tPing + 0.035);

    pingFund.connect(pingFundGain);
    pingSub.connect(pingSubGain);
    pingOvertone.connect(pingOvertoneGain);
    pingClink.connect(pingClinkGain);

    pingFundGain.connect(masterGain);
    pingSubGain.connect(masterGain);
    pingOvertoneGain.connect(masterGain);
    pingClinkGain.connect(masterGain);

    pingFund.start(tPing);
    pingFund.stop(tPing + 0.6);
    pingSub.start(tPing);
    pingSub.stop(tPing + 0.3);
    pingOvertone.start(tPing);
    pingOvertone.stop(tPing + 0.15);
    pingClink.start(tPing);
    pingClink.stop(tPing + 0.04);
  } catch {
    // Ignore Web Audio API restrictions if blocked by browser autoplay settings
  }
}
