/**
 * Sound utility for UI feedback using Web Audio API (Programmatic Synthesis)
 * This avoids external file dependencies and CORS issues.
 */

class SoundManager {
  private context: AudioContext | null = null;

  constructor() {
    // Context is created lazily on first play to comply with browser policies
  }

  private initContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
  }

  private createOscillator(freq: number, type: OscillatorType, startTime: number, duration: number, volume: number = 0.5) {
    this.initContext();
    if (!this.context) return;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    
    // Snappy envelope for high performance
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.002); // Faster attack
    gain.gain.linearRampToValueAtTime(volume * 0.5, startTime + duration * 0.5);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(this.context.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  play(name: 'checkIn' | 'checkOut' | 'error' | 'setting') {
    setTimeout(() => {
      try {
        this.initContext();
        if (!this.context) return;
        
        const now = this.context.currentTime;

        if (name === 'setting') {
          // Soft gentle chime
          this.createOscillator(523.25, 'sine', now, 0.15, 0.3); // C5
          this.createOscillator(659.25, 'sine', now + 0.08, 0.25, 0.3); // E5
          return;
        }
        
        if (name === 'checkIn' || name === 'checkOut') {
          // The one you liked (Triple High Alert) - Sharp & Clear for street
          // Using precise scheduling to ensure zero lag
          this.createOscillator(880, 'square', now, 0.08, 0.7);
          this.createOscillator(880, 'square', now + 0.1, 0.08, 0.7);
          this.createOscillator(880, 'square', now + 0.2, 0.12, 0.7);
          return;
        }

        if (name === 'error') {
          this.createOscillator(220, 'sawtooth', now, 0.1, 0.6);
          this.createOscillator(233.08, 'sawtooth', now, 0.1, 0.6);
          this.createOscillator(110, 'sawtooth', now + 0.1, 0.3, 0.7);
          return;
        }
      } catch (e) {
        console.warn('Sound synthesis failed', e);
      }
    }, 0);
  }

  resume() {
    try {
      this.initContext();
    } catch (e) {
      // Ignore
    }
  }
}

export const soundManager = new SoundManager();
