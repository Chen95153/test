
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { Headphones, Map as MapIcon, Sparkles, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import RoutePlanner from './components/RoutePlanner';
import StoryPlayer from './components/StoryPlayer';
import MapBackground from './components/MapBackground';
import { AppState, RouteDetails, AudioStory } from './types';
import { generateSegment, generateSegmentAudio, calculateTotalSegments, generateStoryOutline } from './services/geminiService';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
    let timer: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    });
    return Promise.race([
        promise.then(val => { clearTimeout(timer); return val; }),
        timeoutPromise
    ]);
};

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.PLANNING);
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const [story, setStory] = useState<AudioStory | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const isGeneratingRef = useRef<boolean>(false);
  const [isBackgroundGenerating, setIsBackgroundGenerating] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number>(0);

  useEffect(() => {
    const SCRIPT_ID = 'google-maps-script';
    const apiKey = process.env.API_KEY?.replace(/["']/g, "").trim();

    if (!apiKey) {
        setScriptError("找不到 API 金鑰，請檢查環境變數設定。");
        return;
    }
    
    if (document.getElementById(SCRIPT_ID) || window.google?.maps) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&v=weekly&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onerror = () => setScriptError("Google 地圖載入失敗。");
    // @ts-ignore
    window.gm_authFailure = () => setScriptError("Google 地圖身份驗證失敗，請檢查 API 金鑰。");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
      if (!story || !route || appState < AppState.READY_TO_PLAY) return;
      const totalGenerated = story.segments.length;
      const neededBufferIndex = currentPlayingIndex + 3; 

      if (totalGenerated < neededBufferIndex && totalGenerated < story.totalSegmentsEstimate && !isGeneratingRef.current) {
          generateNextSegment(totalGenerated + 1);
      }
  }, [story, route, appState, currentPlayingIndex]);

  const generateNextSegment = async (index: number) => {
      if (!route || !story || isGeneratingRef.current) return;
      
      try {
          isGeneratingRef.current = true;
          setIsBackgroundGenerating(true);
          
          const allPreviousText = story.segments.map(s => s.text).join(" ").slice(-3000);
          const segmentOutline = story.outline[index - 1] || "繼續旅程，將情節引向終點。";

          const segmentData = await withTimeout(
              generateSegment(route, index, story.totalSegmentsEstimate, segmentOutline, allPreviousText),
              60000,
              `第 ${index} 章節生成逾時`
          );
          
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const tempCtx = new AudioContextClass();
          const audioBuffer = await withTimeout(
              generateSegmentAudio(segmentData.text, tempCtx),
              100000,
              `第 ${index} 章節語音生成逾時`
          );
          await tempCtx.close();

          setStory(prev => {
              if (!prev) return null;
              if (prev.segments.some(s => s.index === index)) return prev;
              return {
                  ...prev,
                  segments: [...prev.segments, { ...segmentData, audioBuffer }].sort((a, b) => a.index - b.index)
              };
          });

      } catch (e) {
          console.error(`Failed to generate segment ${index}`, e);
      } finally {
          isGeneratingRef.current = false;
          setIsBackgroundGenerating(false);
      }
  };

  const handleGenerateStory = async (details: RouteDetails) => {
    setRoute(details);
    setGenerationError(null);
    
    try {
      setAppState(AppState.GENERATING_INITIAL_SEGMENT);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const totalSegmentsEstimate = calculateTotalSegments(details.durationSeconds);
      setLoadingMessage("正在構思故事大綱... 約 1-2 分鐘");

      const outline = await withTimeout(
          generateStoryOutline(details, totalSegmentsEstimate),
          60000, "故事大綱生成逾時"
      );

      setLoadingMessage("正在撰寫第一章節... 約 1 分鐘");

      const firstOutlineBeat = outline[0] || "開始這段旅程。";
      const seg1Data = await withTimeout(
          generateSegment(details, 1, totalSegmentsEstimate, firstOutlineBeat, ""),
          60000, "初始章節生成逾時"
      );
      
      setLoadingMessage("正在準備語音串流... 約 30 秒");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const seg1Audio = await withTimeout(
          generateSegmentAudio(seg1Data.text, tempCtx),
          100000, "初始語音生成逾時"
      );
      await tempCtx.close();

      setStory({
          totalSegmentsEstimate,
          outline,
          segments: [{ ...seg1Data, audioBuffer: seg1Audio }]
      });

      setAppState(AppState.READY_TO_PLAY);

    } catch (error: any) {
      console.error("Initial generation failed:", error);
      setAppState(AppState.PLANNING);
      
      let message = "無法啟動故事串流。請檢查地點資訊與網路連線後重試。";
      if (error.message && (error.message.includes("timed out") || error.message.includes("timeout"))) {
          message = "故事生成逾時。可能是您的路程較長，請再試一次。";
      }
      setGenerationError(message);
    }
  };

  const handleReset = () => {
      setAppState(AppState.PLANNING);
      setRoute(null);
      setStory(null);
      setCurrentPlayingIndex(0);
      setGenerationError(null);
      isGeneratingRef.current = false;
      setIsBackgroundGenerating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const isHeroVisible = appState < AppState.READY_TO_PLAY;

  if (scriptError) {
      return (
          <div className="min-h-screen bg-editorial-100 flex items-center justify-center p-6">
              <div className="bg-white p-8 rounded-[2rem] shadow-xl max-w-md text-center space-y-4 border-2 border-red-100">
                  <AlertTriangle size={32} className="text-red-500 mx-auto" />
                  <p className="text-stone-600 font-medium">{scriptError}</p>
              </div>
          </div>
      )
  }

  return (
    <div className="min-h-screen bg-editorial-100 text-editorial-900 relative selection:bg-stone-200">
      <MapBackground route={route} />

      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-32">
        <div className={`transition-all duration-700 origin-top ease-in-out max-w-4xl mx-auto ${isHeroVisible ? 'opacity-100 translate-y-0 mb-16' : 'opacity-0 -translate-y-10 h-0 overflow-hidden mb-0'}`}>
            <h1 className="text-5xl md:text-7xl font-serif leading-[1.05] tracking-tight mb-8">
                讓每段路程，都成為 <br/> <span className="italic text-stone-500">一段生動的故事。</span>
            </h1>
            <p className="text-xl text-stone-600 max-w-xl leading-relaxed font-light">
                輸入您的路線，我們將根據您的移動時間，即時生成專屬的語音敘事，與您並肩而行。
            </p>
        </div>

        <div className={`max-w-4xl mx-auto transition-all duration-700 ${appState > AppState.GENERATING_INITIAL_SEGMENT ? 'hidden' : 'block'}`}>
            <RoutePlanner 
              onRouteFound={handleGenerateStory} 
              appState={appState} 
              externalError={generationError}
            />
        </div>

        {appState === AppState.GENERATING_INITIAL_SEGMENT && (
            <div className="mt-16 flex flex-col items-center justify-center space-y-8 animate-fade-in text-center py-12 max-w-4xl mx-auto">
                <Loader2 size={48} className="animate-spin text-editorial-900" />
                <h3 className="text-3xl font-serif text-editorial-900">{loadingMessage}</h3>
            </div>
        )}

        {appState >= AppState.READY_TO_PLAY && story && route && (
            <div className="mt-8 animate-fade-in">
                <StoryPlayer 
                    story={story} 
                    route={route} 
                    onSegmentChange={(index) => setCurrentPlayingIndex(index)}
                    isBackgroundGenerating={isBackgroundGenerating}
                />
                
                <div className="mt-24 text-center border-t border-stone-200 pt-12">
                    <button
                        onClick={handleReset}
                        className="group bg-white hover:bg-stone-50 text-editorial-900 px-8 py-4 rounded-full font-bold flex items-center gap-3 mx-auto transition-all border-2 border-stone-100 hover:border-stone-200 shadow-sm"
                    >
                        結束旅程並開始新的故事
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        )}
      </main>
    </div>
  );
}

export default App;
