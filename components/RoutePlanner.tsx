
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, Loader2, Footprints, Car, CloudRain, Sparkles, ScrollText, Sword } from 'lucide-react';
import { RouteDetails, AppState, StoryStyle } from '../types';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onRouteFound: (details: RouteDetails) => void;
  appState: AppState;
  externalError?: string | null;
}

type TravelMode = 'WALKING' | 'DRIVING';

const STYLES: { id: StoryStyle; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'NOIR', label: '黑色追緝', icon: CloudRain, desc: '冷酷、神祕、雨後街道的沉重氛圍。' },
    { id: 'CHILDREN', label: '童話世界', icon: Sparkles, desc: '奇幻、童心、充滿魔法與驚喜。' },
    { id: 'HISTORICAL', label: '歷史史詩', icon: ScrollText, desc: '莊嚴、宏大，迴盪著過去的榮光。' },
    { id: 'FANTASY', label: '奇幻冒險', icon: Sword, desc: '穿越魔法疆域的英雄史詩任務。' },
];

const RoutePlanner: React.FC<Props> = ({ onRouteFound, appState, externalError }) => {
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  const [travelMode, setTravelMode] = useState<TravelMode>('WALKING');
  const [selectedStyle, setSelectedStyle] = useState<StoryStyle>('NOIR');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (externalError) {
        setError(externalError);
    }
  }, [externalError]);

  useEffect(() => {
    let isMounted = true;
    const initAutocomplete = async () => {
        if (!window.google?.maps?.places) return;
        
        try {
             const setupAutocomplete = (
                 inputElement: HTMLInputElement | null,
                 setAddress: (addr: string) => void
             ) => {
                 if (!inputElement) return;

                 const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
                     fields: ['formatted_address', 'geometry', 'name'],
                     types: ['geocode', 'establishment']
                 });

                 autocomplete.addListener('place_changed', () => {
                     if (!isMounted) return;
                     const place = autocomplete.getPlace();
                     
                     if (!place.geometry || !place.geometry.location) {
                         if (inputElement.value && window.google.maps.Geocoder) {
                             const geocoder = new window.google.maps.Geocoder();
                             geocoder.geocode({ address: inputElement.value }, (results: any, status: any) => {
                                 if (status === 'OK' && results[0]) {
                                     setAddress(results[0].formatted_address);
                                     inputElement.value = results[0].formatted_address;
                                 }
                             });
                         }
                         return;
                     }

                     const address = place.formatted_address || place.name;
                     setAddress(address);
                     inputElement.value = address;
                 });
             };

             setupAutocomplete(startInputRef.current, setStartAddress);
             setupAutocomplete(endInputRef.current, setEndAddress);

        } catch (e) {
            console.error("Failed to initialize Places Autocomplete:", e);
            if (isMounted) setError("地點搜尋功能初始化失敗，請重新整理頁面。");
        }
    };

    if (window.google?.maps?.places) {
        initAutocomplete();
    } else {
        const interval = setInterval(() => {
            if (window.google?.maps?.places) {
                clearInterval(interval);
                initAutocomplete();
            }
        }, 300);
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }
    
    return () => { isMounted = false; };
  }, []);

  const handleCalculate = () => {
    const finalStart = startInputRef.current?.value || startAddress;
    const finalEnd = endInputRef.current?.value || endAddress;

    if (!finalStart || !finalEnd) {
      setError("請搜尋並選擇起點與終點位置。");
      return;
    }

    if (!window.google?.maps) {
         setError("Google 地圖服務尚未就緒，請稍後再試。");
         return;
    }

    setError(null);
    setIsLoading(true);

    const directionsService = new window.google.maps.DirectionsService();
    directionsService.route(
      {
        origin: finalStart,
        destination: finalEnd,
        travelMode: window.google.maps.TravelMode[travelMode],
      },
      (result: any, status: any) => {
        setIsLoading(false);
        if (status === window.google.maps.DirectionsStatus.OK) {
          const leg = result.routes[0].legs[0];

          if (leg.duration.value > 14400) {
            setError("抱歉，這段路程太長了。請選擇 4 小時以內的路線。");
            return;
          }

          onRouteFound({
            startAddress: leg.start_address,
            endAddress: leg.end_address,
            distance: leg.distance.text,
            duration: leg.duration.text,
            durationSeconds: leg.duration.value,
            travelMode: travelMode,
            voiceName: 'Kore',
            storyStyle: selectedStyle
          });
        } else {
          console.error("Directions error:", status, result);
          if (status === 'ZERO_RESULTS') {
              setError(`無法計算從「${finalStart}」到「${finalEnd}」的路線。`);
          } else {
              setError("路徑計算失敗，請檢查地點後重試。");
          }
        }
      }
    );
  };

  const isLocked = appState > AppState.ROUTE_CONFIRMED;

  return (
    <div className={`transition-all duration-700 ${isLocked ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
      <div className="space-y-8 bg-white/80 backdrop-blur-lg p-8 md:p-10 rounded-[2rem] shadow-2xl shadow-stone-200/50 border border-white/50">
        <div className="space-y-1">
            <h2 className="text-2xl font-serif text-editorial-900">規劃您的故事旅程</h2>
            <p className="text-stone-500">搜尋地點並自定義您的沉浸式體驗。</p>
        </div>

        <div className="space-y-4">
          <div className="relative group z-20 h-14 bg-stone-50/50 border-2 border-stone-100 focus-within:border-editorial-900 focus-within:bg-white rounded-xl transition-all shadow-sm focus-within:shadow-md overflow-hidden">
            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-editorial-900 transition-colors pointer-events-none z-10" size={20} />
            <input
                ref={startInputRef}
                type="text"
                placeholder="起點位置"
                className="w-full h-full bg-transparent p-0 pl-12 pr-4 text-editorial-900 placeholder-stone-400 outline-none font-medium text-base"
                onChange={(e) => setStartAddress(e.target.value)}
                disabled={isLocked}
            />
          </div>

          <div className="relative group z-10 h-14 bg-stone-50/50 border-2 border-stone-100 focus-within:border-editorial-900 focus-within:bg-white rounded-xl transition-all shadow-sm focus-within:shadow-md overflow-hidden">
            <Navigation className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-editorial-900 transition-colors pointer-events-none z-10" size={20} />
            <input
                ref={endInputRef}
                type="text"
                placeholder="終點位置"
                className="w-full h-full bg-transparent p-0 pl-12 pr-4 text-editorial-900 placeholder-stone-400 outline-none font-medium text-base"
                onChange={(e) => setEndAddress(e.target.value)}
                disabled={isLocked}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
            <div className="space-y-3">
                <label className="text-sm font-medium text-stone-500 uppercase tracking-wider">交通工具</label>
                <div className="flex gap-2 bg-stone-100/50 p-1.5 rounded-xl border border-stone-100">
                    {(['WALKING', 'DRIVING'] as TravelMode[]).map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setTravelMode(mode)}
                            disabled={isLocked}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-all ${
                                travelMode === mode 
                                    ? 'bg-white text-editorial-900 shadow-md' 
                                    : 'text-stone-500 hover:bg-stone-200/50 hover:text-stone-700'
                            }`}
                        >
                            {mode === 'WALKING' && <Footprints size={18} />}
                            {mode === 'DRIVING' && <Car size={18} />}
                            <span>
                                {mode === 'WALKING' ? '步行' : '開車'}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        </div>

        <div className="space-y-3">
            <label className="text-sm font-medium text-stone-500 uppercase tracking-wider">故事風格</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STYLES.map((style) => {
                    const Icon = style.icon;
                    const isSelected = selectedStyle === style.id;
                    return (
                        <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                            disabled={isLocked}
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                                isSelected
                                    ? 'border-editorial-900 bg-editorial-900 text-white shadow-md'
                                    : 'border-stone-100 bg-stone-50/50 text-stone-600 hover:border-stone-300 hover:bg-stone-100'
                            }`}
                        >
                            <Icon size={24} className={`shrink-0 ${isSelected ? 'text-white' : 'text-stone-400'}`} />
                            <div>
                                <div className={`font-bold ${isSelected ? 'text-white' : 'text-editorial-900'}`}>
                                    {style.label}
                                </div>
                                <div className={`text-xs mt-1 leading-tight ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                                    {style.desc}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium animate-fade-in">{error}</p>
        )}

        <button
          onClick={handleCalculate}
          disabled={isLoading || isLocked || !startAddress || !endAddress}
          className="w-full bg-editorial-900 text-white py-4 rounded-full font-bold text-lg hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-editorial-900/20 active:scale-[0.99]"
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" /> 正在規劃路徑...
            </>
          ) : (
            <>
               <Sparkles size={20} className="animate-subtle-pulse" />
               生成您的專屬故事
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default RoutePlanner;
