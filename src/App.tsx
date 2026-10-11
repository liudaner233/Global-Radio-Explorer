import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Info, Loader2, Radio, X, Headphones, Heart, Stamp } from 'lucide-react';
import { motion } from 'motion/react';
import AboutDialog from './components/AboutDialog';
import FavoritesPanel from './components/FavoritesPanel';
import GlobeView from './components/GlobeView';
import Player from './components/Player';
import ParticleBackground from './components/ParticleBackground';
import SidePanel from './components/SidePanel';
import Sidebar from './components/Sidebar';
import { useFavorites } from './hooks/useFavorites';
import { useStationCatalog } from './hooks/useStationCatalog';
import type { RadioStation } from './types/radio';
import type { NearbyStation } from './lib/nearbyStations';
import { dedupeFavoriteStations } from './lib/favorites';
import { hasStationSignal } from './lib/stationEligibility';
import { useListeningPassport } from './hooks/useListeningPassport';
import { useSignalJourney } from './hooks/useSignalJourney';
import ListeningPassport from './components/ListeningPassport';
import { cn } from './lib/utils';

export default function App() {
  const catalog = useStationCatalog();
  const { favorites, isFavorite, toggleFavorite } = useFavorites(catalog.stations);
  const [selectedStation, setSelectedStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [nearbyStations, setNearbyStations] = useState<NearbyStation[] | null>(null);
  const [mapStations, setMapStations] = useState<RadioStation[]>([]);
  const [rightView, setRightView] = useState<'favorites' | 'passport'>('favorites');
  const [quiet, setQuiet] = useState(false);
  const savedPanels = useRef({ left: true, right: true });
  const passport = useListeningPassport();
  const discoveryStations = useMemo(
    () => dedupeFavoriteStations([...mapStations, ...catalog.stations].filter(hasStationSignal)),
    [mapStations, catalog.stations]
  );
  const [panels, setPanels] = useState(() => ({
    left: window.innerWidth >= 768,
    right: window.innerWidth >= 1280,
  }));
  const error = playerError || catalog.error;

  const playStation = useCallback((station: RadioStation) => {
    setPlayerError(null);
    setSelectedStation(station);
    setIsPlaying(true);
  }, []);
  const journey = useSignalJourney(playStation);
  const followStation = journey.followStation;
  const togglePlay = useCallback(() => setIsPlaying((playing) => !playing), []);

  useEffect(() => {
    const mobile = matchMedia('(max-width: 767px)');
    function closeMobilePanels() {
      if (mobile.matches) setPanels({ left: false, right: false });
    }
    mobile.addEventListener('change', closeMobilePanels);
    return () => mobile.removeEventListener('change', closeMobilePanels);
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || showInfo) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return;
      if (event.key === '/') {
        event.preventDefault();
        setQuiet(false);
        setPanels((current) => ({
          ...current,
          left: true,
          right: window.innerWidth < 768 ? false : current.right,
        }));
        requestAnimationFrame(() =>
          document.getElementById('station-search')?.focus({ preventScroll: true })
        );
      } else if (event.code === 'Space' && selectedStation && !target.closest('button, a')) {
        event.preventDefault();
        setIsPlaying((playing) => !playing);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [showInfo, selectedStation]);

  function togglePanel(side: 'left' | 'right') {
    setQuiet(false);
    setPanels((current) => {
      const open = !current[side];
      if (open && window.innerWidth < 768)
        return { left: side === 'left', right: side === 'right' };
      return { ...current, [side]: open };
    });
  }

  const selectStation = useCallback(
    (station: RadioStation) => {
      followStation(station);
      playStation(station);
    },
    [followStation, playStation]
  );

  function toggleQuiet() {
    if (quiet) {
      const restored = savedPanels.current;
      setPanels(
        window.innerWidth < 768 && restored.left && restored.right
          ? { left: true, right: false }
          : restored
      );
    } else {
      savedPanels.current = panels;
      setPanels({ left: false, right: false });
    }
    setQuiet((current) => !current);
  }

  function dismissError() {
    setPlayerError(null);
    catalog.dismissError();
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black font-sans text-white">
      <ParticleBackground />
      <GlobeView
        initializing={catalog.initializing}
        stations={catalog.stations}
        selectedStation={selectedStation}
        onSelectStation={selectStation}
        nearbyActive={catalog.tab === 'nearby' && panels.left}
        genre={catalog.genre}
        onNearbyChange={setNearbyStations}
        onMapStationsChange={setMapStations}
        journeyRoute={journey.route}
      />

      <div inert={showInfo} className="pointer-events-none relative z-10 flex h-full flex-col">
        <header className="pointer-events-auto flex items-center justify-between gap-2 px-3 py-4 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/[0.06] bg-zinc-950/65 p-2 pr-3 shadow-lg backdrop-blur-md sm:gap-3 sm:pr-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/20 sm:h-10 sm:w-10">
              <Radio className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight drop-shadow-lg sm:text-xl">
                Global Radio
              </h1>
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-400 sm:text-[10px] sm:tracking-[0.2em]">
                Live Explorer
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {catalog.statusText && (
              <div className="hidden max-w-56 items-center gap-2 rounded-full border border-blue-500/30 bg-zinc-950/80 px-3 py-1 text-xs text-blue-200 sm:flex">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="truncate">{catalog.statusText}</span>
              </div>
            )}
            <div id="station-scan-control" className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
            <button
              onClick={toggleQuiet}
              aria-label={quiet ? 'Exit quiet listening' : 'Enter quiet listening'}
              aria-pressed={quiet}
              title={quiet ? 'Restore your sidebars' : 'Quiet listening'}
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-zinc-950/80 transition-colors sm:h-10 sm:w-10',
                quiet
                  ? 'border-cyan-200/40 text-cyan-100'
                  : 'border-white/10 text-white/50 hover:text-white'
              )}
            >
              <Headphones className="h-4 w-4" />
            </button>
            <button
              ref={infoButtonRef}
              onClick={() => setShowInfo(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900/50 transition-colors hover:bg-zinc-800 sm:h-10 sm:w-10"
              aria-label="Show about dialog"
            >
              <Info className="h-5 w-5 text-zinc-400" />
            </button>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 overflow-clip p-4 sm:p-6">
          <SidePanel
            side="left"
            hasPlayer={Boolean(selectedStation)}
            collapsed={!panels.left}
            onToggle={() => togglePanel('left')}
            hideMobileToggle={panels.right}
          >
            <Sidebar
              catalog={catalog}
              onSelectStation={selectStation}
              selectedStation={selectedStation}
              onToggleFavorite={toggleFavorite}
              isFavorite={isFavorite}
              nearbyStations={nearbyStations}
              discoveryStations={discoveryStations}
              active={panels.left}
              onStartJourney={journey.start}
              journey={journey}
            />
          </SidePanel>

          <div className="flex flex-1 flex-col items-center justify-end pb-12">
            {selectedStation && (
              <Player
                station={selectedStation}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                isFavorite={isFavorite(selectedStation)}
                onToggleFavorite={() => toggleFavorite(selectedStation)}
                onPlaybackError={setPlayerError}
                onPlayingChange={setIsPlaying}
                onListeningProgress={passport.recordListening}
                journey={
                  journey.route.length
                    ? { index: journey.index, length: journey.route.length }
                    : undefined
                }
                onPreviousStation={journey.previous}
                onNextStation={journey.next}
              />
            )}
            {!selectedStation && !catalog.initializing && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-auto mb-4 w-full max-w-sm rounded-2xl border border-white/10 bg-[#10141b]/80 px-5 py-4 text-center shadow-xl backdrop-blur-xl"
              >
                <Radio className="mx-auto mb-2 h-5 w-5 text-blue-300/80" />
                <h2 className="text-sm font-semibold text-white">
                  {catalog.initialError && catalog.stations.length === 0
                    ? 'Station list unavailable'
                    : catalog.stations.length === 0
                      ? 'No stations available'
                      : 'Choose a station to start listening'}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                  {catalog.initialError && catalog.stations.length === 0
                    ? 'Retry loading the station list from the sidebar or the error banner below.'
                    : catalog.stations.length === 0
                      ? 'The app is running, but there are no stations to show right now.'
                      : 'Select any station from the left sidebar and the player will switch here.'}
                </p>
              </motion.div>
            )}
          </div>

          <SidePanel
            side="right"
            hasPlayer={Boolean(selectedStation)}
            collapsed={!panels.right}
            onToggle={() => togglePanel('right')}
            hideMobileToggle={panels.left}
          >
            <div className="flex h-full flex-col gap-2">
              <nav
                aria-label="Listening shelf"
                className="flex shrink-0 gap-1 rounded-xl border border-white/[0.08] bg-zinc-950/85 p-1 text-[11px] backdrop-blur-md"
              >
                <button
                  onClick={() => setRightView('favorites')}
                  aria-pressed={rightView === 'favorites'}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2',
                    rightView === 'favorites'
                      ? 'bg-white/[0.07] text-rose-100'
                      : 'text-white/40 hover:text-white'
                  )}
                >
                  <Heart className="h-3 w-3" />
                  Saved
                </button>
                <button
                  onClick={() => setRightView('passport')}
                  aria-pressed={rightView === 'passport'}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2',
                    rightView === 'passport'
                      ? 'bg-white/[0.07] text-cyan-100'
                      : 'text-white/40 hover:text-white'
                  )}
                >
                  <Stamp className="h-3 w-3" />
                  Passport
                </button>
              </nav>
              <div className="min-h-0 flex-1">
                {rightView === 'favorites' ? (
                  <FavoritesPanel
                    favorites={favorites}
                    selectedStation={selectedStation}
                    onSelectStation={selectStation}
                    onToggleFavorite={toggleFavorite}
                  />
                ) : (
                  <ListeningPassport
                    passport={passport.passport}
                    onSelectStation={selectStation}
                    onClear={passport.clearPassport}
                  />
                )}
              </div>
            </div>
          </SidePanel>
        </main>
      </div>

      <AboutDialog
        open={showInfo}
        onClose={() => setShowInfo(false)}
        returnFocusRef={infoButtonRef}
      />

      {error && (
        <div
          role="alert"
          className="fixed top-24 left-1/2 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-red-800 bg-red-900/90 px-4 py-3 shadow-2xl backdrop-blur-md sm:rounded-full sm:px-6"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span className="min-w-0 text-xs font-medium leading-relaxed sm:text-sm">{error}</span>
          {catalog.initialError && (
            <button
              onClick={() => {
                catalog.retry();
              }}
              className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs transition-colors hover:bg-white/20"
            >
              Retry
            </button>
          )}
          <button
            onClick={dismissError}
            className="shrink-0 rounded-full p-1 text-white/80 transition-colors hover:bg-white/20"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
