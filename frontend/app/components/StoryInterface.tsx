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
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
  const [isEventComplete, setIsEventComplete] = useState(false);

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

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      
      // Scale context to account for device pixel ratio
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas.parentElement!);
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      if (!isActive || !ctx) return;

      const frequencies = audioService.getFrequencies('voice');
      
      if (frequencies?.values) {
        const barWidth = Math.max(4, Math.min(20, canvas.width / 128));
        
        // Use dynamic color based on playing state
        const baseColor = isAudioPlaying ? '#c084fc' : '#9ca3af';
        
        WavRenderer.drawBars(
          canvas,
          ctx,
          frequencies.values,
          baseColor,
          barWidth,
          3,   // Slightly higher min height
          150  // Increased scale for better visibility
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
  const goToNextEvent = async () => {
    if (!scene || !sequencer || currentEventIndex >= scene.events.length - 1) return;
    
    setCurrentEventIndex(prev => prev + 1);
    setIsEventComplete(false);
    
    // Wait for state update before processing next event
    setTimeout(async () => {
      await sequencer.processNextEvent();
    }, 0);
  };

  const goToPreviousEvent = () => {
    if (currentEventIndex > 0 && !isAudioPlaying) {
      setCurrentEventIndex(prev => prev - 1);
    }
  };

  useEffect(() => {
    if (!sequencer || !currentEvent) return;
    
    const checkEventStatus = setInterval(() => {
      const status = sequencer.getEventStatus(currentEvent.id);
      if (status === 'complete') {
        setIsEventComplete(true);
      }
    }, 100);

    return () => clearInterval(checkEventStatus);
  }, [sequencer, currentEvent]);

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

      <div className="flex justify-between items-center gap-4">
        <Button
          onClick={goToPreviousEvent}
          disabled={currentEventIndex === 0 || isAudioPlaying}
          className="text-lg py-2 px-6 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-full transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </Button>

        <Button
          onClick={goToNextEvent}
          disabled={currentEventIndex >= scene?.events.length - 1 || isAudioPlaying || !isEventComplete}
          className="text-lg py-2 px-6 bg-yellow-400 hover:bg-yellow-500 text-purple-800 font-bold rounded-full transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
        >
          Next
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}