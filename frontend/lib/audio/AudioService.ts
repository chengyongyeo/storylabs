// AudioService.ts
import { WavStreamPlayer } from '../wavtools/lib/wav_stream_player';
import EventEmitter from 'events';

// Export the type for use in other files
export type { WavStreamPlayer };

class AudioService {
  private static instance: AudioService;
  private player: WavStreamPlayer;
  private isInitialized: boolean = false;
  private audioContext: AudioContext | null = null;
  private eventEmitter = new EventEmitter();

  private constructor() {
    this.player = new WavStreamPlayer({ sampleRate: 24000 });
  }

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      await this.player.connect();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  async streamAudioChunk(audioData: Int16Array, trackId: string) {
    if (!this.isInitialized) {
      throw new Error('AudioService not initialized');
    }
    this.player.add16BitPCM(audioData, trackId);
    
    // Emit event when chunk is processed
    this.eventEmitter.emit('chunkProcessed', trackId);
  }

  async interrupt() {
    if (!this.isInitialized) return;
    return this.player.interrupt();
  }

  getFrequencies(channel: 'voice' | 'frequency' | 'music' = 'voice') {
    if (!this.isInitialized) {
      return { values: new Float32Array(128).fill(0) };
    }
    try {
      return this.player.getFrequencies(channel);
    } catch (error) {
      return { values: new Float32Array(128).fill(0) };
    }
  }

  async unlockAudio() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  getPlayer(): WavStreamPlayer {
    return this.player;
  }

  isReady(): boolean {
    return this.isInitialized && !!this.audioContext;
  }

  onAudioComplete(callback: (trackId: string) => void) {
    this.eventEmitter.on('chunkProcessed', callback);
  }
}

export const audioService = AudioService.getInstance();