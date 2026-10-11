import { lazy, memo, Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { AlertCircle, RefreshCw } from 'lucide-react';
import type { RadioStation } from '../types/radio';
import type { NearbyStation } from '../lib/nearbyStations';
import type { StationGenre } from '../lib/stationGenres';

const Globe = lazy(() => import('./Globe'));

const GlobeErrorFallback = ({ error }: FallbackProps) => {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
      <AlertCircle className="mb-4 h-16 w-16 text-red-500" />
      <h2 className="mb-2 text-2xl font-bold">Something went wrong</h2>
      <p className="mb-6 max-w-md text-zinc-400">
        The 3D visualization failed to load. You can still browse and listen to stations from the
        sidebar.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-zinc-800 px-4 py-2 transition-colors hover:bg-zinc-700"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Application
      </button>
      {error?.message && (
        <pre className="mt-8 max-w-full overflow-auto rounded bg-black/50 p-4 text-left text-xs text-red-400">
          {error.message}
        </pre>
      )}
    </div>
  );
};

interface GlobeViewProps {
  stations: RadioStation[];
  selectedStation: RadioStation | null;
  onSelectStation: (station: RadioStation) => void;
  initializing?: boolean;
  nearbyActive?: boolean;
  genre?: StationGenre;
  onNearbyChange?: (stations: NearbyStation[]) => void;
  onMapStationsChange?: (stations: RadioStation[]) => void;
  journeyRoute?: RadioStation[];
}

const GlobeView = memo(function GlobeView({
  stations,
  selectedStation,
  onSelectStation,
  initializing,
  nearbyActive,
  genre,
  onNearbyChange,
  onMapStationsChange,
  journeyRoute,
}: GlobeViewProps) {
  return (
    <div className="absolute inset-0 z-0">
      <ErrorBoundary FallbackComponent={GlobeErrorFallback} onError={() => onNearbyChange?.([])}>
        <Suspense
          fallback={
            <div className="flex h-full w-full flex-col items-center justify-center bg-zinc-950">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500/20 border-t-blue-500" />
              <p className="animate-pulse font-medium text-zinc-500">Initializing 3D world...</p>
            </div>
          }
        >
          <Globe
            stations={stations}
            onSelectStation={onSelectStation}
            selectedStation={selectedStation}
            initializing={initializing}
            nearbyActive={nearbyActive}
            genre={genre}
            onNearbyChange={onNearbyChange}
            onMapStationsChange={onMapStationsChange}
            journeyRoute={journeyRoute}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
});

export default GlobeView;
