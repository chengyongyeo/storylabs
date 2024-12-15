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

      const sessionParams = {
        modalities: ['text', 'audio'],
        output_audio_format: 'pcm16' as const,
        input_audio_transcription: { model: 'whisper-1' as const },
        turn_detection: { type: 'server_vad' as const },
        temperature: 0.3
      };
      
      console.log('StorySequencer: Updating session with params:', sessionParams);
      const response = await this.client.updateSession(sessionParams);
      console.log('Session update response:', response);

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
      const isNarratorEvent = !pendingEvent.character;
      const narratorCharacter = this.currentScene?.events.find(e => e.character?.name === 'Narrator')?.character;
      
      if (isNarratorEvent && !narratorCharacter) {
        throw new Error('Narrator character not found in scene');
      }

      const characterInstructions = isNarratorEvent
        ? `You are the Narrator. ${narratorCharacter!.prompt}. 
           Your personality is ${JSON.stringify(narratorCharacter!.personality)}.
           Say exactly: "${pendingEvent.text}"`
        : `You are ${pendingEvent.character.name}. ${pendingEvent.character.prompt}. 
           Your personality is ${JSON.stringify(pendingEvent.character.personality)}.
           ${pendingEvent.emotion ? `Speak with ${pendingEvent.emotion} emotion.` : ''}
           Say exactly: "${pendingEvent.text}"`;

      const sessionUpdateParams = {
        modalities: ['text', 'audio'],
        voice: isNarratorEvent ? narratorCharacter!.voice : pendingEvent.character.voice,
        instructions: characterInstructions,
        output_audio_format: 'pcm16' as const
      };

      console.log('Updating session with params:', sessionUpdateParams);
      const sessionResponse = await this.client.updateSession(sessionUpdateParams);
      console.log('Session update response:', sessionResponse);

      await this.client.sendUserMessageContent([
        { type: 'input_text', text: pendingEvent.text }
      ]);

      await this.client.realtime.send('response.create', {
        modalities: ['text', 'audio'],
        instructions: characterInstructions,
        voice: isNarratorEvent ? narratorCharacter!.voice : pendingEvent.character.voice,
        output_audio_format: 'pcm16' as const,
        temperature: 0.1
      });
      
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

