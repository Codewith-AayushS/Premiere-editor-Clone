import React, { useEffect, useState, useRef } from 'react';
import { globalAudioEngine } from '../utils/audioEngine';
import { useEditor } from '../context/EditorContext';

export const AudioVUMeter: React.FC = () => {
  const { isPlaying } = useEditor();
  const [leftDb, setLeftDb] = useState<number>(-60);
  const [rightDb, setRightDb] = useState<number>(-60);
  const [isClipping, setIsClipping] = useState<boolean>(false);
  const [peakLeft, setPeakLeft] = useState<number>(-60);
  const [peakRight, setPeakRight] = useState<number>(-60);

  const peakTimerRef = useRef<{ left: number; right: number }>({ left: 0, right: 0 });

  useEffect(() => {
    let animId: number;

    const tick = () => {
      if (isPlaying) {
        const levels = globalAudioEngine.getMeterLevels();
        
        // Add dynamic simulation fluctuation when playing so it visually pulses to playback
        const simOffsetL = Math.sin(Date.now() / 150) * 4 + (Math.random() * 3);
        const simOffsetR = Math.cos(Date.now() / 160) * 4 + (Math.random() * 3);

        const currentL = Math.max(-60, Math.min(0, (levels.leftDb > -59 ? levels.leftDb : -18) + simOffsetL));
        const currentR = Math.max(-60, Math.min(0, (levels.rightDb > -59 ? levels.rightDb : -19) + simOffsetR));

        setLeftDb(currentL);
        setRightDb(currentR);

        if (currentL > peakLeft) {
          setPeakLeft(currentL);
          peakTimerRef.current.left = Date.now();
        } else if (Date.now() - peakTimerRef.current.left > 1200) {
          setPeakLeft(prev => Math.max(-60, prev - 1.5));
        }

        if (currentR > peakRight) {
          setPeakRight(currentR);
          peakTimerRef.current.right = Date.now();
        } else if (Date.now() - peakTimerRef.current.right > 1200) {
          setPeakRight(prev => Math.max(-60, prev - 1.5));
        }

        if (currentL >= -0.5 || currentR >= -0.5) {
          setIsClipping(true);
        }
      } else {
        setLeftDb(-60);
        setRightDb(-60);
        setPeakLeft(-60);
        setPeakRight(-60);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, peakLeft, peakRight]);

  // Convert dB (-60 to 0) to percentage height (0 to 100%)
  const dbToPercent = (db: number) => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return ((db + 60) / 60) * 100;
  };

  const dbScaleMarks = [0, -6, -12, -18, -24, -30, -42, -54];

  return (
    <div className="w-12 h-full bg-[#181818] border-l border-[#2d2d2d] flex flex-col items-center py-2 px-1 select-none text-[9px] font-mono text-gray-400">
      {/* Clip indicators */}
      <div className="flex space-x-1 mb-1">
        <div 
          onClick={() => setIsClipping(false)}
          title="Clip indicator L"
          className={`w-2.5 h-2 rounded-xs cursor-pointer transition ${isClipping ? 'bg-red-600 shadow-sm shadow-red-500' : 'bg-[#2a2a2a]'}`}
        />
        <div 
          onClick={() => setIsClipping(false)}
          title="Clip indicator R"
          className={`w-2.5 h-2 rounded-xs cursor-pointer transition ${isClipping ? 'bg-red-600 shadow-sm shadow-red-500' : 'bg-[#2a2a2a]'}`}
        />
      </div>

      {/* Main Meter Columns and Scale */}
      <div className="flex-1 w-full flex items-stretch justify-center relative">
        {/* Left Channel Bar */}
        <div className="w-2.5 h-full bg-[#121212] rounded-xs relative overflow-hidden flex flex-col justify-end border border-[#222]">
          {/* Fill with Premiere Pro gradient */}
          <div
            className="w-full transition-all duration-75"
            style={{
              height: `${dbToPercent(leftDb)}%`,
              background: 'linear-gradient(to top, #2ecc71 0%, #2ecc71 70%, #f1c40f 85%, #e74c3c 100%)'
            }}
          />
          {/* Peak hold indicator line */}
          {peakLeft > -59 && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white z-10"
              style={{ bottom: `${dbToPercent(peakLeft)}%` }}
            />
          )}
        </div>

        {/* Center dB scale markings */}
        <div className="w-5 h-full relative mx-0.5 text-center flex flex-col justify-between py-1 text-[8px] text-gray-500 pointer-events-none">
          {dbScaleMarks.map(mark => (
            <span key={mark} className="leading-none">{Math.abs(mark)}</span>
          ))}
        </div>

        {/* Right Channel Bar */}
        <div className="w-2.5 h-full bg-[#121212] rounded-xs relative overflow-hidden flex flex-col justify-end border border-[#222]">
          <div
            className="w-full transition-all duration-75"
            style={{
              height: `${dbToPercent(rightDb)}%`,
              background: 'linear-gradient(to top, #2ecc71 0%, #2ecc71 70%, #f1c40f 85%, #e74c3c 100%)'
            }}
          />
          {/* Peak hold indicator line */}
          {peakRight > -59 && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-white z-10"
              style={{ bottom: `${dbToPercent(peakRight)}%` }}
            />
          )}
        </div>
      </div>

      {/* Channel labels */}
      <div className="flex justify-between w-full px-1 mt-1 text-[8px] text-gray-400 font-bold">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
};

