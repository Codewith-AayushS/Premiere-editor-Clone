/**
 * Web Audio Engine for Real-Time Multitrack Playback and VU Metering
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyserLeft: AnalyserNode | null = null;
  private analyserRight: AnalyserNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private isInitialized = false;

  constructor() {}

  public init() {
    if (this.isInitialized && this.ctx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Stereo metering
      this.splitter = this.ctx.createChannelSplitter(2);
      this.analyserLeft = this.ctx.createAnalyser();
      this.analyserRight = this.ctx.createAnalyser();

      this.analyserLeft.fftSize = 256;
      this.analyserRight.fftSize = 256;

      this.masterGain.connect(this.ctx.destination);
      this.masterGain.connect(this.splitter);

      this.splitter.connect(this.analyserLeft, 0);
      this.splitter.connect(this.analyserRight, 1);

      this.isInitialized = true;
    } catch (err) {
      console.warn('AudioContext initialization failed or blocked by autoplay policy:', err);
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setMasterVolume(volume: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(2.0, volume)), this.ctx.currentTime);
    }
  }

  public getMeterLevels(): { leftDb: number; rightDb: number; isClipping: boolean } {
    if (!this.analyserLeft || !this.analyserRight) {
      return { leftDb: -60, rightDb: -60, isClipping: false };
    }

    const dataLeft = new Float32Array(this.analyserLeft.fftSize);
    const dataRight = new Float32Array(this.analyserRight.fftSize);

    this.analyserLeft.getFloatTimeDomainData(dataLeft);
    this.analyserRight.getFloatTimeDomainData(dataRight);

    let peakLeft = 0;
    let peakRight = 0;

    for (let i = 0; i < dataLeft.length; i++) {
      const valL = Math.abs(dataLeft[i]);
      if (valL > peakLeft) peakLeft = valL;

      const valR = Math.abs(dataRight[i]);
      if (valR > peakRight) peakRight = valR;
    }

    const toDb = (peak: number) => {
      if (peak <= 0.0001) return -60;
      const db = 20 * Math.log10(peak);
      return Math.max(-60, Math.min(6, db));
    };

    const leftDb = toDb(peakLeft);
    const rightDb = toDb(peakRight);

    return {
      leftDb,
      rightDb,
      isClipping: leftDb >= 0 || rightDb >= 0
    };
  }
}

export const globalAudioEngine = new AudioEngine();

