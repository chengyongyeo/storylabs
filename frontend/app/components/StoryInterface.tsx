// frontend/app/components/StoryInterface.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { SceneParser } from '@/lib/story/SceneParser'
import { StorySequencer } from '@/lib/story/StorySequencer'
import { WavRenderer } from '@/lib/wavtools/WavRenderer'
import type { ParsedScene, StoryEvent } from '@/lib/story/SceneParser'
import { audioService } from '@/lib/audio/AudioService'
import { WavStreamPlayer } from '@/lib/audio/AudioService'

interface StoryInterfaceProps {
  userInfo: {
    name: string
    age: string
    interests: string
  }
}

export default function StoryInterface({ userInfo }: StoryInterfaceProps) {
  // Essential states
  const [sequencer, setSequencer] = useState<StorySequencer | null>(null);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [scene, setScene] = useState<ParsedScene | null>(null);
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isSystemReady, setIsSystemReady] = useState(false);

  const wavStreamPlayer = useRef<WavStreamPlayer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  // Derived state
  const currentEvent = scene?.events[currentEventIndex];
  const isAudioPlaying = sequencer?.getEventStatus(currentEvent?.id || '') === 'playing';

  // Initialize with env variable
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY

  // Initialize audio system first
  useEffect(() => {
    let mounted = true;

    async function initializeAudio() {
      try {
        console.log('Initializing audio system...');
        await audioService.initialize();
        if (!mounted) return;
        
        wavStreamPlayer.current = audioService.getPlayer();
        await audioService.unlockAudio();
        setIsAudioReady(true);
        console.log('Audio system initialized');
      } catch (error) {
        console.error('Failed to initialize audio:', error);
      }
    }

    initializeAudio();
    return () => { mounted = false; };
  }, []);

  // Initialize story sequencer after audio is ready
  useEffect(() => {
    if (!apiKey || !isAudioReady) return;

    let mounted = true;

    async function initializeStory() {
      try {
        console.log('Initializing story system...');
        const seq = new StorySequencer({ apiKey });
        await seq.connect();
        
        if (!mounted) return;
        setSequencer(seq);

        const [charactersText, sceneText] = await Promise.all([
          fetch('/stories/characters.md').then(r => r.text()),
          fetch('/stories/scene_rocket_intro.md').then(r => r.text())
        ]);

        const parser = new SceneParser(charactersText);
        const parsedScene = parser.parseScene(sceneText);
        await seq.loadScene(parsedScene);
        
        if (!mounted) return;
        setScene(parsedScene);
        setIsSystemReady(true);
        console.log('Story system initialized');
        
        await seq.processNextEvent();
      } catch (error) {
        console.error('Error initializing story:', error);
      }
    }

    initializeStory();
    return () => { mounted = false; };
  }, [apiKey, isAudioReady]);

  // Visualization effect - only start when system is fully ready
  useEffect(() => {
    if (!canvasRef.current || !isSystemReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isActive = true;

    // Responsive sizing function
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Set display size
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      
      // Set actual size in memory
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // Scale context to match DPR
      ctx.scale(dpr, dpr);
      
      console.log('Canvas resized:', {
        displayWidth: rect.width,
        displayHeight: rect.height,
        actualWidth: canvas.width,
        actualHeight: canvas.height,
        dpr
      });
    };

    // Initial resize
    resizeCanvas();
    
    // Add resize observer for container changes
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(canvas.parentElement!);

    // Add window resize listener
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      if (!isActive || !ctx) return;

      const frequencies = audioService.getFrequencies('voice');
      
      if (frequencies?.values) {
        // Calculate responsive bar width based on canvas size
        const barWidth = Math.max(4, Math.min(20, canvas.width / 100));
        
        WavRenderer.drawBars(
          canvas,
          ctx,
          frequencies.values,
          isAudioPlaying ? '#9333ea' : '#e5e7eb',
          barWidth,  // Dynamic bar width
          2,   // min height
          100  // scale
        );
      }

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      isActive = false;
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSystemReady, isAudioPlaying]);

  // Audio playback controls
  const goToNextEvent = () => {
    if (scene && currentEventIndex < scene.events.length - 1 && !isAudioPlaying) {
      setCurrentEventIndex(prev => prev + 1);
    }
  };

  const goToPreviousEvent = () => {
    if (currentEventIndex > 0 && !isAudioPlaying) {
      setCurrentEventIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    console.log('Audio playing state:', isAudioPlaying);
  }, [isAudioPlaying]);

  return (
    <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl w-full">
      <h2 className="text-3xl font-bold text-purple-800 mb-6 text-center">
        {userInfo.name}'s Adventure
      </h2>
      
      <div className="relative h-80 mb-6">
        <AnimatePresence mode="wait">
          <motion.img
            key={`backdrop-${currentEventIndex}`}
            src={`/assets/scenes/${currentEvent ? scene?.scene || 'default' : 'default'}.jpg`}
            alt="Story backdrop"
            className="absolute top-0 left-0 w-full h-full object-cover rounded-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        </AnimatePresence>
        
        <AnimatePresence mode="wait">
          {currentEvent?.character && (
            <motion.div
              key={`character-${currentEventIndex}`}
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="relative">
                <img 
                  src={`/assets/characters/${currentEvent.character.name.toLowerCase()}.png`}
                  alt={currentEvent.character.name}
                  className="h-64 object-contain"
                />
                {currentEvent.emotion && (
                  <div className="absolute top-0 right-0 bg-yellow-400 px-2 py-1 rounded-full text-sm">
                    {currentEvent.emotion}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-6 bg-gray-100 rounded-lg p-4">
        <div className="relative w-full aspect-[8/1]">
          <canvas 
            ref={canvasRef}
            className="w-full h-full"
            style={{ 
              display: 'block',
              backgroundColor: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem'
            }}
          />
        </div>
      </div>

      <motion.p
        key={`text-${currentEventIndex}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="text-xl text-gray-800 mb-6 text-center"
      >
        {currentEvent?.text}
      </motion.p>

      <div className="flex justify-between items-center">
        <Button
          onClick={goToPreviousEvent}
          disabled={currentEventIndex === 0 || isAudioPlaying}
          variant="outline"
        >
          Previous
        </Button>

        <Button
          onClick={goToNextEvent}
          disabled={currentEventIndex >= scene?.events.length - 1 || isAudioPlaying}
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  )
}