// frontend/lib/story/StorySequencer.ts
import { RealtimeClient } from '@openai/realtime-api-beta';
import type { ParsedScene, StoryEvent } from './SceneParser';
import { getOpenAIClient } from './openai';
import { audioService } from '../audio/AudioService';

interface AudioEvent {
  id: string;
  text: string;
  status: 'pending' | 'playing' | 'complete';
}

interface SequencerOptions {
  apiKey?: string;
  serverUrl?: string;
}

export class StorySequencer {
  private client: RealtimeClient;
  private currentScene?: ParsedScene;
  private audioEvents: Map<string, AudioEvent> = new Map();
  private isProcessing: boolean = false;
  private currentEventId?: string;
  private readonly options: SequencerOptions;

  constructor(options: SequencerOptions) {
    this.options = options;
    this.client = null!;
  }

  private setupClientHandlers() {
    this.client.on('conversation.updated', async ({ item, delta }) => {
      // Handle audio chunks as they come in
      if (delta?.audio && this.currentEventId) {
        console.log('Received audio chunk for event:', this.currentEventId);
        await audioService.streamAudioChunk(delta.audio, item.id);
      }

      // Check for true completion with audio
      if (item.status === 'completed' && item.formatted?.audio?.length && this.currentEventId) {
        console.log('Event fully completed with audio:', this.currentEventId);
        const audioEvent = this.audioEvents.get(this.currentEventId);
        
        if (audioEvent) {
          // Ensure we have all audio data before marking as complete
          try {
            // Optional: You can also store the complete audio data if needed
            // const completeAudio = item.formatted.audio;
            
            setTimeout(() => {
              audioEvent.status = 'complete';
              this.isProcessing = false;
              this.currentEventId = undefined;
            }, 500);
          } catch (error) {
            console.error('Error handling audio completion:', error);
          }
        }
      }
    });

    this.client.on('conversation.interrupted', async () => {
      console.log('Conversation interrupted');
      await audioService.interrupt();
      this.isProcessing = false;
      this.currentEventId = undefined;
    });

    this.client.on('error', (error: any) => {
      console.error('RealtimeClient error:', error);
      this.isProcessing = false;
      this.currentEventId = undefined;
    });
  }

  public async connect(): Promise<void> {
    try {
      console.log('StorySequencer: Creating OpenAI client...');
      this.client = await getOpenAIClient({
        apiKey: this.options.apiKey,
        serverUrl: this.options.serverUrl
      });

      console.log('StorySequencer: Setting up client handlers...');
      this.setupClientHandlers();

      console.log('StorySequencer: Updating session...');
      await this.client.updateSession({
        modalities: ['text', 'audio'],
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: { type: 'server_vad' }
      });

      console.log('StorySequencer connected successfully');
    } catch (error) {
      console.error('Failed to connect StorySequencer:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await audioService.interrupt();
  }

  public async loadScene(scene: ParsedScene): Promise<void> {
    console.log('Loading scene:', scene);
    this.currentScene = scene;
    this.audioEvents.clear();
    this.currentEventId = undefined;
    this.isProcessing = false;
    
    for (const event of scene.events) {
      this.audioEvents.set(event.id, {
        id: event.id,
        text: event.text,
        status: 'pending'
      });
    }
    console.log('Scene loaded, events initialized:', this.audioEvents.size);
    
  }

  public async processNextEvent(): Promise<AudioEvent | null> {
    if (!this.currentScene || this.isProcessing || this.currentEventId) {
      console.log('Cannot process next event:', { 
        hasScene: !!this.currentScene, 
        isProcessing: this.isProcessing, 
        currentEventId: this.currentEventId 
      });
      return null;
    }

    const pendingEvent = this.currentScene.events.find(event => 
      this.audioEvents.get(event.id)?.status === 'pending'
    );

    if (!pendingEvent) {
      console.log('No pending events found');
      return null;
    }

    console.log('Processing event:', pendingEvent);
    this.isProcessing = true;
    this.currentEventId = pendingEvent.id;
    const audioEvent = this.audioEvents.get(pendingEvent.id)!;
    audioEvent.status = 'playing';

    try {
      const characterInstructions = pendingEvent.character 
        ? `You are ${pendingEvent.character.name}. ${pendingEvent.character.prompt}. 
           Your personality is ${JSON.stringify(pendingEvent.character.personality)}.
           ${pendingEvent.emotion ? `Speak with ${pendingEvent.emotion} emotion.` : ''}
           Say exactly: "${pendingEvent.text}"`
        : `You are the Narrator. Warm, friendly storyteller with a magical presence. 
           Your personality is engaging and imaginative, your goal is to guide children 
           through the story while building excitement, and your speech style is clear, 
           warm, and filled with wonder.
           Say exactly: "${pendingEvent.text}"`;

      await this.client.updateSession({
        modalities: ['text', 'audio'],
        voice: pendingEvent.character?.voice || 'sage',
        instructions: characterInstructions,
        output_audio_format: 'pcm16'
      });

      console.log('Sending message:', {
        voice: pendingEvent.character?.voice || 'sage',
        text: pendingEvent.text
      });

      await this.client.sendUserMessageContent([
        { type: 'input_text', text: pendingEvent.text }
      ]);

      await this.client.realtime.send('response.create', {
        modalities: ['text', 'audio'],
        instructions: characterInstructions,
        voice: pendingEvent.character?.voice || 'coral', // Default narrator voice
        output_audio_format: 'pcm16',
        temperature: 0.1
    });
      
      // Return the audio event so UI can track its status
      return audioEvent;
    } catch (error) {
      console.error('Error processing audio event:', error);
      this.isProcessing = false;
      this.currentEventId = undefined;
      audioEvent.status = 'pending';
      return null;
    }

  }

  public getEventStatus(eventId: string): 'pending' | 'playing' | 'complete' | null {
    return this.audioEvents.get(eventId)?.status || null;
  }

  public getAllEvents(): AudioEvent[] {
    return Array.from(this.audioEvents.values());
  }

  // Add method to check if current event is complete
  public isCurrentEventComplete(): boolean {
    return !this.isProcessing && !this.currentEventId;
  }
}

