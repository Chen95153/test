
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, MapPin, Clock, Footprints, Car, Loader2, ArrowDownCircle } from 'lucide-react';
import { AudioStory, RouteDetails, StorySegment } from '../types';
import InlineMap from './InlineMap';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface Props {
  story: AudioStory;
  route: RouteDetails;
  onSegmentChange: (index: number) => void;
  isBackgroundGenerating: boolean;
}

const StoryPlayer: React.FC<Props> = ({ story, route, onSegmentChange, isBackgroundGenerating }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0); 
  const segmentOffsetRef = useRef<number>(0); 
  
  const indexRef = useRef(currentSegmentIndex);
  const textContainerRef = useRef<HTMLDivElement>(null);
  const currentSegment = story.segments[currentSegmentIndex];

  useEffect(() => {
      indexRef.current = currentSegmentIndex;
  }, [currentSegmentIndex]);

  useEffect(() => {
    return () => {
      stopAudio();
      audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
      onSegmentChange(currentSegmentIndex);
  }, [currentSegmentIndex, onSegmentChange]);

  useEffect(() => {
      const segmentNowReady = story.segments[currentSegmentIndex];
      if (isBuffering && isPlaying && segmentNowReady?.audioBuffer) {
          setIsBuffering(false);
          playSegment(segmentNowReady, 0);
      }
  }, [story.segments, currentSegmentIndex, isBuffering, isPlaying]);

  useEffect(() => {
      if (autoScroll && textContainerRef.current) {
          const lastParagraph = textContainerRef.current.lastElementChild;
          lastParagraph?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
  }, [story.segments.length, currentSegmentIndex, autoScroll]);

  const stopAudio = () => {
      if (sourceRef.current) {
          sourceRef.current.onended = null;
          try { sourceRef.current.stop(); } catch (e) {}
          sourceRef.current = null;
      }
  };

  const playSegment = async (segment: StorySegment, offset: number = 0) => {
      if (!segment?.audioBuffer) {
           setIsBuffering(true);
           return;
      }

      if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }

      stopAudio();

      const source = audioContextRef.current.createBufferSource();
      source.buffer = segment.audioBuffer;
      source.connect(audioContextRef.current.destination);
      sourceRef.current = source;

      source.onended = () => {
          if (!audioContextRef.current) return;
          const elapsed = audioContextRef.current.currentTime - startTimeRef.current;
          if (elapsed >= segment.audioBuffer!.duration - 0.5) { 
              handleSegmentEnd();
          }
      };

      startTimeRef.current = audioContextRef.current.currentTime - offset;
      source.start(0, offset);
  };

  const handleSegmentEnd = () => {
      const currentIndex = indexRef.current;
      const nextIndex = currentIndex + 1;
      
      setCurrentSegmentIndex(nextIndex);
      segmentOffsetRef.current = 0;
      
      if (story.segments[nextIndex]?.audioBuffer) {
          playSegment(story.segments[nextIndex], 0);
      } else {
          if (nextIndex >= story.totalSegmentsEstimate && !isBackgroundGenerating) {
              setIsPlaying(false);
          } else {
              setIsBuffering(true);
          }
      }
  };

  const togglePlayback = async () => {
    if (isPlaying) {
      if (audioContextRef.current && !isBuffering) {
          segmentOffsetRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      }
      stopAudio();
      setIsPlaying(false);
      setAutoScroll(false);
    } else {
      setIsPlaying(true);
      if (currentSegment?.audioBuffer) {
         setIsBuffering(false);
         playSegment(currentSegment, segmentOffsetRef.current);
         setAutoScroll(true);
      } else {
          setIsBuffering(true);
      }
    }
  };

  const ModeIcon = route.travelMode === 'DRIVING' ? Car : Footprints;

  return (
    <div className="w-full max-w-5xl mx-auto animate-fade-in pb-24 px-4 md:px-6">
      <div className="w-full aspect-video bg-stone-100 rounded-[2rem] shadow-2xl overflow-hidden relative mb-8 border-4 border-white">
           <InlineMap 
              route={route} 
              currentSegmentIndex={currentSegmentIndex}
              totalSegments={story.totalSegmentsEstimate}
           />
           <div className="absolute bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-auto bg-white/95 backdrop-blur-md p-4 rounded-[1.5rem] shadow-lg border border-white/50 flex items-center gap-4 md:max-w-md z-10">
                <div className="bg-editorial-900 text-white p-3 rounded-full shrink-0">
                    <ModeIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-xs text-stone-500 font-bold uppercase tracking-wider mb-0.5">目的地</div>
                    <div className="text-editorial-900 font-serif text-lg leading-tight truncate">{route.endAddress}</div>
                </div>
            </div>
      </div>

      <div className="sticky top-6 z-30 bg-editorial-900 text-white rounded-full p-4 md:p-5 shadow-2xl mb-16 flex items-center justify-between transition-transform ring-4 ring-editorial-100">
         <div className="flex items-center gap-4 pl-4">
             {isBuffering ? (
                 <div className="flex items-center gap-2 text-amber-300 text-sm font-medium animate-pulse">
                     <Loader2 size={18} className="animate-spin" />
                     <span>串流緩衝中...</span>
                 </div>
             ) : (
                <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-stone-500'}`}></div>
                    <span className="text-sm font-medium text-stone-300 hidden md:block">
                        {isPlaying ? '故事播送中' : '串流已暫停'}
                    </span>
                </div>
             )}
         </div>

         <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
             <span className="font-serif text-lg md:text-xl">
                 約 {route.duration} 的旅程
             </span>
         </div>

         <div className="flex items-center gap-4 pr-1">
             <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded-full transition-colors ${autoScroll ? 'text-white bg-white/10' : 'text-stone-500 hover:text-white'}`} title="切換自動捲動">
                 <ArrowDownCircle size={20} />
             </button>
             <button
                onClick={togglePlayback}
                className="bg-white text-editorial-900 p-3 md:p-4 rounded-full hover:scale-105 active:scale-95 transition-all"
            >
                {isPlaying && !isBuffering ? <Pause size={24} className="fill-current" /> : <Play size={24} className="fill-current ml-1" />}
            </button>
         </div>
      </div>

      <div ref={textContainerRef} className="max-w-3xl mx-auto space-y-12 min-h-[50vh]">
          {story.segments.map((segment, idx) => (
              <div 
                key={segment.index} 
                className={`transition-all duration-1000 ${segment.index === currentSegmentIndex + 1 ? 'opacity-100 scale-100' : segment.index <= currentSegmentIndex ? 'opacity-60' : 'opacity-0 translate-y-10'}`}
              >
                  <p className="prose prose-xl md:prose-2xl max-w-none font-serif leading-relaxed text-editorial-900">
                    {segment.text}
                  </p>
                  {idx < story.segments.length - 1 && (
                      <div className="w-24 h-[2px] bg-stone-200 my-12 mx-auto"></div>
                  )}
              </div>
          ))}

          {(isBuffering || isBackgroundGenerating) && (
              <div className="flex flex-col items-center justify-center gap-3 pt-12 pb-4 opacity-70 animate-pulse">
                  <div className="relative">
                    <Loader2 size={24} className="animate-spin text-editorial-900" />
                  </div>
                  <span className="text-sm font-medium text-stone-500 uppercase tracking-widest">正在構思下一段情節...</span>
              </div>
          )}
      </div>
    </div>
  );
};

export default StoryPlayer;
