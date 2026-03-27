import React, { useState, useEffect, Suspense, lazy } from 'react';
import { RadioStation } from './types/radio';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import { Info, Radio, Globe as GlobeIcon, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Lazy load Globe to prevent it from blocking the initial UI render
const Globe = lazy(() => import('./components/Globe'));

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  state: { hasError: boolean, error: Error | null } = { hasError: false, error: null };
  props: { children: React.ReactNode };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-950 text-white p-6 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-zinc-400 mb-6 max-w-md">
            The 3D visualization failed to load. You can still browse and listen to stations using the sidebar.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Application
          </button>
          {this.state.error && (
            <pre className="mt-8 p-4 bg-black/50 rounded text-xs text-red-400 overflow-auto max-w-full text-left">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInitialStations = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('https://de1.api.radio-browser.info/json/stations/search?limit=200&hidebroken=true&order=clickcount&reverse=true&is_https=true');
        if (!response.ok) throw new Error('Failed to fetch stations');
        const data = await response.json();
        setStations(data);
        setError(null);
      } catch (err) {
        console.error('Error fetching stations:', err);
        setError('Could not connect to radio directory. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitialStations();
  }, []);

  const handleSelectStation = (station: RadioStation) => {
    setSelectedStation(station);
    setIsPlaying(true);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* Background Globe Container */}
      <div className="absolute inset-0 z-0">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="flex flex-col items-center justify-center h-full w-full bg-zinc-950">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-zinc-500 font-medium animate-pulse">Initializing 3D World...</p>
            </div>
          }>
            <Globe 
              stations={stations} 
              onSelectStation={handleSelectStation}
              selectedStation={selectedStation}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* UI Overlay */}
      <div className="relative z-10 pointer-events-none h-full flex flex-col">
        {/* Header */}
        <header className="p-6 flex justify-between items-center pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Radio className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Global Radio</h1>
              <p className="text-[10px] text-blue-400 uppercase tracking-[0.2em] font-bold">Live Explorer</p>
            </div>
          </div>
          
          <button 
            onClick={() => setShowInfo(true)}
            className="w-10 h-10 rounded-full bg-zinc-900/50 border border-zinc-800 flex items-center justify-center hover:bg-zinc-800 transition-colors"
          >
            <Info className="w-5 h-5 text-zinc-400" />
          </button>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden p-6 gap-6">
          <div className="pointer-events-auto w-80 shrink-0">
            <Sidebar 
              onSelectStation={handleSelectStation} 
              selectedStation={selectedStation}
              onStationsUpdate={setStations}
            />
          </div>
          
          <div className="flex-1 flex flex-col justify-end items-center pb-12">
            {selectedStation && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-auto"
              >
                <Player 
                  station={selectedStation}
                  isPlaying={isPlaying}
                  onTogglePlay={() => setIsPlaying(!isPlaying)}
                />
              </motion.div>
            )}
          </div>
        </main>
      </div>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
                  <GlobeIcon className="text-white w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">About Explorer</h2>
                  <p className="text-zinc-500 text-sm">v1.0.0 • Open Source</p>
                </div>
              </div>
              
              <div className="space-y-4 text-zinc-400 leading-relaxed mb-8">
                <p>
                  Welcome to Global Radio Explorer. This application allows you to discover and stream over 30,000 radio stations from around the world.
                </p>
                <p>
                  Simply rotate the globe and click on any blue marker to tune in. You can also use the sidebar to search by name or country.
                </p>
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-xs">Powered by Radio Browser API and Three.js</p>
                </div>
              </div>
              
              <button 
                onClick={() => setShowInfo(false)}
                className="w-full py-4 bg-white text-black font-bold rounded-2xl hover:bg-zinc-200 transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Initial Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
          >
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-600/20"
            >
              <Radio className="text-white w-10 h-10" />
            </motion.div>
            <h2 className="text-2xl font-bold mb-2 tracking-tight">Global Radio</h2>
            <p className="text-zinc-500 text-sm animate-pulse">Connecting to world frequencies...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-red-900/90 border border-red-800 px-6 py-3 rounded-full flex items-center gap-3 backdrop-blur-md shadow-2xl">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm font-medium">{error}</span>
          <button 
            onClick={() => window.location.reload()}
            className="ml-2 text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
