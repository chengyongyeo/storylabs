// AudioService.ts
import { WavStreamPlayer } from '../wavtools/lib/wav_stream_player';

// Export the type for use in other files
export type { WavStreamPlayer };

class AudioService {
  private static instance: AudioService;
  private player: WavStreamPlayer;
  private isInitialized: boolean = false;
  private audioContext: AudioContext | null = null;

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
      console.log('AudioService: Creating AudioContext...');
      this.audioContext = new AudioContext({ sampleRate: 24000 });
      
      console.log('AudioService: Connecting WavStreamPlayer...');
      await this.player.connect();
      
      console.log('AudioService: Checking analyzer node...');
      if (!this.player.analyser) {
        console.warn('AudioService: No analyzer node found!');
      }
      
      this.isInitialized = true;
      console.log('AudioService: Initialization complete');
    } catch (error) {
      console.error('Failed to initialize AudioService:', error);
      throw error;
    }
  }

  async streamAudioChunk(audioData: Int16Array, trackId: string) {
    if (!this.isInitialized) {
      throw new Error('AudioService not initialized');
    }
    this.player.add16BitPCM(audioData, trackId);
  }

  async interrupt() {
    if (!this.isInitialized) return;
    return this.player.interrupt();
  }

  getFrequencies(channel: 'voice' | 'frequency' | 'music' = 'voice') {
    if (!this.isInitialized) {
      console.log('AudioService: Not initialized when getting frequencies');
      return { values: new Float32Array(128).fill(0) };
    }
    try {
      // Get raw frequency data
      const frequencies = this.player.getFrequencies(channel);
      
      // Log the actual values we're getting
      console.log('AudioService: Raw frequencies', {
        hasData: !!frequencies,
        channel,
        length: frequencies?.values?.length,
        analyserExists: !!this.player.analyser,
        maxValue: frequencies?.values ? Math.max(...Array.from(frequencies.values)) : 0,
        firstFewValues: frequencies?.values ? Array.from(frequencies.values.slice(0, 5)) : []
      });

      return frequencies;
    } catch (error) {
      console.error('Error getting frequencies:', error);
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
}

export const audioService = AudioService.getInstance();