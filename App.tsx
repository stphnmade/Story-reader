import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateSpeech, rewriteStory, generateStoryTitle } from './services/geminiService';
import { decode, decodeAudioData, encodeWAV } from './utils/audio';
import { expandAcronyms } from './utils/text';
import { PlayIcon, StopIcon, LoadingSpinnerIcon, MicIcon, SparklesIcon, DownloadIcon } from './components/Icons';

const VOICES = ['Charon', 'Kore', 'Puck', 'Zephyr', 'Fenrir'];

const generateDefaultText = (voiceName: string) => 
    `Hey, this is the voice of ${voiceName}. You can adjust my speed, pitch, and the story's temperature to hear how I sound.`;

const App: React.FC = () => {
  const [voice, setVoice] = useState<string>('Charon');
  
  const [storyText, setStoryText] = useState<string>(() => generateDefaultText(voice));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isFixingStory, setIsFixingStory] = useState<boolean>(false);
  const [suggestedFix, setSuggestedFix] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [pitch, setPitch] = useState<number>(0);
  const [temperature, setTemperature] = useState<number>(1);
  const [audioData, setAudioData] = useState<Uint8Array | null>(null);
  const [storyTitle, setStoryTitle] = useState<string>('story');
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [audioCache, setAudioCache] = useState<Record<string, Uint8Array>>({});

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);

  useEffect(() => {
    const preloadVoices = async () => {
        console.log("Preloading default voice audio...");
        for (const voiceName of VOICES) {
            try {
                if (audioCache[voiceName]) continue;

                const defaultText = generateDefaultText(voiceName);
                const base64Audio = await generateSpeech(defaultText, 1, voiceName); // Use default temp of 1
                const decodedData = decode(base64Audio);
                setAudioCache(prevCache => ({
                    ...prevCache,
                    [voiceName]: decodedData,
                }));
                console.log(`Successfully cached audio for ${voiceName}.`);
            } catch (error) {
                console.error(`Failed to preload audio for voice ${voiceName}:`, error);
            }
        }
    };

    preloadVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  useEffect(() => {
    setStoryText(currentStory => {
        const isDefault = VOICES.some(v => currentStory === generateDefaultText(v));
        if (isDefault) {
            return generateDefaultText(voice);
        }
        return currentStory;
    });
  }, [voice]);

  const stopPlayback = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      audioSourceRef.current.stop();
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    stopPlayback();
    audioBufferRef.current = null;
    setAudioData(null);
    setCurrentTime(0);
    setDuration(0);
    setStoryTitle('story');
  }, [storyText, voice, temperature, stopPlayback]);

  useEffect(() => {
    if (audioSourceRef.current && isPlaying) {
      audioSourceRef.current.playbackRate.value = playbackRate;
      audioSourceRef.current.detune.value = pitch;
    }
  }, [playbackRate, pitch, isPlaying]);

  const handleUseFix = () => {
    if (suggestedFix) {
      setStoryText(suggestedFix);
      setSuggestedFix(null);
      setError(null);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const startPlayback = useCallback((offset: number) => {
    if (!audioBufferRef.current || !audioContextRef.current) return;

    if (audioSourceRef.current) {
        audioSourceRef.current.onended = null;
        audioSourceRef.current.stop();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackRate;
    source.detune.value = pitch;
    source.connect(audioContextRef.current.destination);

    const safeOffset = Math.max(0, Math.min(offset, duration));
    source.start(0, safeOffset);

    source.onended = () => {
        if (audioSourceRef.current === source) {
            stopPlayback();
            setCurrentTime(duration);
        }
    };

    audioSourceRef.current = source;
    playbackStartTimeRef.current = audioContextRef.current.currentTime;
    startOffsetRef.current = safeOffset;
    setIsPlaying(true);

    const updateProgress = () => {
        if (!audioSourceRef.current || !audioContextRef.current) return;

        const elapsedTime = (audioContextRef.current.currentTime - playbackStartTimeRef.current) * playbackRate;
        const newTime = startOffsetRef.current + elapsedTime;

        if (newTime >= duration) {
            setCurrentTime(duration);
        } else {
            setCurrentTime(newTime);
            animationFrameIdRef.current = requestAnimationFrame(updateProgress);
        }
    };
    animationFrameIdRef.current = requestAnimationFrame(updateProgress);
  }, [playbackRate, pitch, duration, stopPlayback]);

  const playDecodedAudio = useCallback(async (decodedData: Uint8Array) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      setAudioData(decodedData);
      
      generateStoryTitle(storyText)
        .then(setStoryTitle)
        .catch(err => {
            console.error("Failed to generate custom story title, using default.", err);
            setStoryTitle('story');
        });
        
      const audioBuffer = await decodeAudioData(decodedData, audioContext, 24000, 1);
      
      audioBufferRef.current = audioBuffer;
      setDuration(audioBuffer.duration);
      setCurrentTime(0);
      startPlayback(0);
  }, [startPlayback, storyText]);

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (audioBufferRef.current) {
        const resumeTime = currentTime >= duration ? 0 : currentTime;
        startPlayback(resumeTime);
        return;
    }

    if (!storyText.trim()) {
      setError('Please enter a story to read.');
      return;
    }

    const isDefaultText = storyText === generateDefaultText(voice);
    const cachedAudio = audioCache[voice];

    if (isDefaultText && cachedAudio) {
      await playDecodedAudio(cachedAudio);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuggestedFix(null);

    try {
      const processedText = expandAcronyms(storyText);
      const base64Audio = await generateSpeech(processedText, temperature, voice);
      const decodedData = decode(base64Audio);

      if (isDefaultText && !cachedAudio) {
        setAudioCache(prev => ({...prev, [voice]: decodedData}));
      }
      
      await playDecodedAudio(decodedData);

    } catch (err) {
      console.error('Error generating or playing speech:', err);
      if (err instanceof Error && err.message.includes('PROHIBITED_CONTENT')) {
        setError('The story could not be processed due to the content policy. Please revise the text or use our suggestion.');
        setIsFixingStory(true);
        rewriteStory(storyText)
          .then(setSuggestedFix)
          .catch(rewriteError => {
            console.error('Failed to generate fix:', rewriteError);
            setError('The story was blocked and we failed to generate a suggestion. Please revise it manually.');
          })
          .finally(() => setIsFixingStory(false));
      } else {
        setError('Failed to generate audio. The story might be too complex or too long. Please try a shorter story or try again later.');
      }
      setIsPlaying(false);
      audioBufferRef.current = null;
      setDuration(0);
      setCurrentTime(0);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (isPlaying) {
        startPlayback(newTime);
    }
  };

  const handleDownload = () => {
    if (!audioData) return;
    const wavBlob = encodeWAV(audioData, 24000, 1, 16);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storyTitle}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl mx-auto bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6">
        <header className="text-center">
            <div className="flex justify-center items-center gap-3">
                <MicIcon className="w-8 h-8 text-brand-orange" />
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
                    Expressive Story Teller
                </h1>
            </div>
          <p className="mt-2 text-gray-400">
            Paste a Reddit story and hear it read with emotion by Gemini.
          </p>
        </header>

        <main>
          <div className="relative">
            <textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Paste your story here... AITA for telling my sister she couldn't wear white to my wedding?"
              className="w-full h-64 p-4 bg-gray-900 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange transition-colors duration-200 resize-y text-gray-200 placeholder-gray-500"
              disabled={isLoading || isPlaying}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6 my-6">
              <div>
                  <label htmlFor="speed" className="block mb-2 text-sm font-medium text-gray-400">
                      Speed: <span className="font-bold text-gray-200 tabular-nums">{playbackRate.toFixed(1)}x</span>
                  </label>
                  <input
                      id="speed"
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={playbackRate}
                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                      disabled={isLoading}
                  />
              </div>
              <div>
                  <label htmlFor="pitch" className="block mb-2 text-sm font-medium text-gray-400">
                      Pitch: <span className="font-bold text-gray-200 tabular-nums">{pitch >= 0 ? '+' : ''}{pitch / 100}</span>
                  </label>
                  <input
                      id="pitch"
                      type="range"
                      min="-1200"
                      max="1200"
                      step="100"
                      value={pitch}
                      onChange={(e) => setPitch(parseInt(e.target.value, 10))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                      disabled={isLoading}
                  />
              </div>
               <div>
                  <label htmlFor="temperature" className="block mb-2 text-sm font-medium text-gray-400">
                      Temperature: <span className="font-bold text-gray-200 tabular-nums">{temperature.toFixed(1)}</span>
                  </label>
                  <input
                      id="temperature"
                      type="range"
                      min="0"
                      max="1.7"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-orange"
                      disabled={isLoading}
                  />
              </div>
              <div>
                  <label htmlFor="voice" className="block mb-2 text-sm font-medium text-gray-400">
                      Voice
                  </label>
                  <select
                      id="voice"
                      value={voice}
                      onChange={(e) => setVoice(e.target.value)}
                      disabled={isLoading}
                      className="w-full p-2 bg-gray-700 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-brand-orange focus:border-brand-orange transition-colors duration-200 appearance-none"
                  >
                      {VOICES.map((v) => (
                          <option key={v} value={v}>{v}</option>
                      ))}
                  </select>
              </div>
          </div>
        </main>

        <footer className="flex flex-col items-center justify-center space-y-4">
          {duration > 0 && !isLoading && (
            <div className="w-full flex items-center gap-3 text-sm">
                <span className="font-mono text-gray-400 tabular-nums">{formatTime(currentTime)}</span>
                <input
                    type="range"
                    aria-label="Audio progress"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={currentTime}
                    onChange={handleScrub}
                    disabled={isLoading}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-orange disabled:accent-gray-600"
                />
                <span className="font-mono text-gray-400 tabular-nums">{formatTime(duration)}</span>
            </div>
          )}

          {audioData && !isLoading && (
              <div className="text-center w-full bg-gray-700/50 p-3 rounded-lg">
                  <p className="text-sm text-gray-400 font-medium">Download Filename</p>
                  <p className="mt-1 font-mono text-gray-200 bg-gray-900 px-3 py-1.5 rounded-md text-sm truncate" title={`${storyTitle}.wav`}>
                      {storyTitle}.wav
                  </p>
              </div>
          )}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={handlePlay}
              disabled={isLoading}
              className={`flex items-center justify-center w-full md:w-auto px-8 py-4 text-lg font-semibold rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
                ${isLoading ? 'bg-gray-600 cursor-not-allowed' : 
                  isPlaying ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' :
                  'bg-brand-orange hover:bg-orange-600 focus:ring-orange-500'}
                  text-white transform hover:scale-105 disabled:scale-100`}
            >
              {isLoading ? (
                <>
                  <LoadingSpinnerIcon className="w-6 h-6 mr-3" />
                  Generating...
                </>
              ) : isPlaying ? (
                <>
                  <StopIcon className="w-6 h-6 mr-3" />
                  Stop
                </>
              ) : (
                <>
                  <PlayIcon className="w-6 h-6 mr-3" />
                  Read Aloud
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={!audioData || isPlaying || isLoading}
              className="flex items-center justify-center p-4 text-lg font-semibold rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50 bg-gray-600 hover:bg-gray-500 focus:ring-gray-400 text-white disabled:bg-gray-700 disabled:cursor-not-allowed disabled:text-gray-500"
              aria-label="Download Audio"
            >
              <DownloadIcon className="w-6 h-6" />
            </button>
          </div>
          
          {error && <p className="text-red-400 text-center">{error}</p>}
          
          {isFixingStory && (
              <div className="flex items-center justify-center text-yellow-400 mt-4">
                  <LoadingSpinnerIcon className="w-5 h-5 mr-2" />
                  <p>Attempting to generate a safe version...</p>
              </div>
          )}

          {suggestedFix && !isFixingStory && (
              <div className="mt-4 p-4 border border-yellow-600 bg-yellow-900/30 rounded-lg w-full text-left">
                  <h3 className="font-semibold text-yellow-400 flex items-center gap-2">
                      <SparklesIcon className="w-5 h-5" />
                      Suggested Story Fix
                  </h3>
                  <p className="mt-2 p-3 bg-gray-900 rounded text-gray-300 whitespace-pre-wrap font-mono text-sm max-h-40 overflow-y-auto">
                      {suggestedFix}
                  </p>
                  <button
                      onClick={handleUseFix}
                      className="mt-3 w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                      Use This Version
                  </button>
              </div>
          )}
        </footer>
      </div>
       <div className="text-center mt-8 text-gray-500 text-sm">
        <p>Powered by Google Gemini</p>
      </div>
    </div>
  );
};

export default App;
