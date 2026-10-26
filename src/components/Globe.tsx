import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { DoubleSide, MeshBasicMaterial } from 'three';
import { createPortal } from 'react-dom';
import { Radar } from 'lucide-react';
import GlobeGL from 'react-globe.gl';
import { useCountries } from '../hooks/useCountries';
import { useGlobeControls } from '../hooks/useGlobeControls';
import { useGlobeMaterial } from '../hooks/useGlobeMaterial';
import { useCountryStations } from '../hooks/useCountryStations';
import { useStationSignals } from '../hooks/useStationSignals';
import { useDetailMap } from '../hooks/useDetailMap';
import { useGlobePicker } from '../hooks/useGlobePicker';
import { useGlobeDayNight } from '../hooks/useGlobeDayNight';
import { useMapStations } from '../hooks/useMapStations';
import { DETAIL_ALTITUDE } from '../lib/globeView';
import {
  getCountryAtLocation,
  getCountryId,
  getCountryName,
  type CountryFeature,
} from '../lib/countries';
import type { RadioStation } from '../types/radio';
import CountryPanel from './CountryPanel';
import GlobePicker from './GlobePicker';
import { useNearbyStations } from '../hooks/useNearbyStations';
import type { NearbyStation } from '../lib/nearbyStations';
import { getStationSignalGenre, type StationGenre } from '../lib/stationGenres';
import { useCountryInteraction } from '../hooks/useCountryInteraction';
import { useCountryBoundaries } from '../hooks/useCountryBoundaries';

interface GlobeProps {
  stations: RadioStation[];
  onSelectStation: (station: RadioStation) => void;
  selectedStation?: RadioStation | null;
  initializing?: boolean;
  nearbyActive?: boolean;
  genre?: StationGenre;
  onNearbyChange?: (stations: NearbyStation[]) => void;
  onMapStationsChange?: (stations: RadioStation[]) => void;
  journeyRoute?: RadioStation[];
}

function createStationMarker(station: RadioStation, genre: StationGenre) {
  const { color } = getStationSignalGenre(station, genre);
  const el = document.createElement('div');
  el.innerHTML = `
            <div class="relative">
              <div class="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full animate-ping" style="background-color:${color}"></div>
              <div class="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white" style="background-color:${color}"></div>
            </div>
          `;
  return el;
}

export default function Globe({
  stations,
  onSelectStation,
  selectedStation,
  initializing = false,
  nearbyActive = false,
  genre = 'all',
  onNearbyChange,
  onMapStationsChange,
  journeyRoute,
}: GlobeProps) {
  const { ref, dimensions, ready, onReady, zoom, resetView } = useGlobeControls(
    selectedStation,
    Boolean(journeyRoute?.length)
  );
  const reducedMotion = useReducedMotion();
  const journeyArcs = useMemo(
    () =>
      (journeyRoute || []).slice(1).map((station, index) => ({
        startLat: journeyRoute![index].geo_lat!,
        startLng: journeyRoute![index].geo_long!,
        endLat: station.geo_lat!,
        endLng: station.geo_long!,
      })),
    [journeyRoute]
  );
  const [detailed, setDetailed] = useState(false);
  const detailedRef = useRef(false);
  const globeMaterial = useGlobeMaterial();
  const [countryMaterials] = useState(() => ({
    clear: new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
      visible: false,
    }),
    highlight: new MeshBasicMaterial({
      color: '#60a5fa',
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: DoubleSide,
    }),
  }));
  useEffect(
    () => () => {
      countryMaterials.clear.dispose();
      countryMaterials.highlight.dispose();
    },
    [countryMaterials]
  );
  const { countries, error } = useCountries();
  useCountryBoundaries(ref, ready, countries, detailed);
  const [hoveredCountry, setHoveredCountry] = useState<CountryFeature | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryFeature | null>(null);
  const lastSignalPick = useRef<Event | null>(null);
  const highlightedCountryKey = getCountryId(hoveredCountry ?? selectedCountry);
  const highlightedCountries = useMemo(
    () => (hoveredCountry ? [hoveredCountry] : selectedCountry ? [selectedCountry] : []),
    [hoveredCountry, selectedCountry]
  );
  const hoverCountry = useCallback((country: CountryFeature | null) => {
    setHoveredCountry((previous) =>
      getCountryId(previous) === getCountryId(country) ? previous : country
    );
  }, []);
  const selectCountry = useCallback((country: CountryFeature, event: PointerEvent) => {
    if (event !== lastSignalPick.current) setSelectedCountry(country);
  }, []);
  useCountryInteraction(ref, ready, countries, hoverCountry, selectCountry);
  const geoStations = useMapStations(ready, stations, selectedStation);
  useEffect(() => {
    onMapStationsChange?.(geoStations);
  }, [geoStations, onMapStationsChange]);
  const signalsReady = ready && (!initializing || geoStations.length > 0);
  const countryStations = useCountryStations(selectedCountry);
  const startScan = useStationSignals(
    ref,
    signalsReady,
    geoStations,
    (station, event) => {
      lastSignalPick.current = event;
      onSelectStation(station);
    },
    genre
  );
  const detailMap = useDetailMap(ref, ready, detailed, globeMaterial);
  useGlobeDayNight(ref, ready, detailMap.blend);
  const picker = useGlobePicker(ref, ready, geoStations);
  useNearbyStations(ref, ready && nearbyActive, geoStations, genre, onNearbyChange);

  return (
    <div className="w-full h-full fixed inset-0 z-0 flex items-center justify-center">
      <GlobeGL
        ref={ref}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeMaterial={globeMaterial}
        globeTileEngineUrl={detailMap.tileUrl}
        globeCurvatureResolution={2}
        arcsData={journeyArcs}
        arcColor={() => ['rgba(125, 211, 252, 0.55)', 'rgba(110, 231, 183, 0.5)']}
        arcStroke={0.4}
        arcAltitudeAutoScale={0.22}
        arcDashLength={0.5}
        arcDashGap={0.3}
        arcDashAnimateTime={reducedMotion ? 0 : 2400}
        arcsTransitionDuration={reducedMotion ? 0 : 500}
        onZoom={(view) => {
          const next = view.altitude < (detailedRef.current ? 0.85 : DETAIL_ALTITUDE);
          if (next !== detailedRef.current) {
            detailedRef.current = next;
            setDetailed(next);
          }
          if (view.altitude < DETAIL_ALTITUDE && ref.current)
            ref.current.controls().autoRotate = false;
        }}
        showAtmosphere
        atmosphereColor="#60a5fa"
        atmosphereAltitude={0.12}
        onGlobeReady={onReady}
        enablePointerInteraction={false}
        polygonsData={highlightedCountries}
        polygonCapMaterial={(country: CountryFeature) => {
          const currentKey = getCountryId(country);
          return currentKey === highlightedCountryKey
            ? countryMaterials.highlight
            : countryMaterials.clear;
        }}
        polygonSideMaterial={countryMaterials.clear}
        polygonsTransitionDuration={0}
        polygonStrokeColor={(country: CountryFeature) => {
          const currentKey = getCountryId(country);
          return currentKey === highlightedCountryKey
            ? 'rgba(96, 165, 250, 0.95)'
            : 'rgba(255, 255, 255, 0.2)';
        }}
        polygonAltitude={detailed ? 0.000003 : 0.002}
        onPolygonHover={(country) => {
          setHoveredCountry(country as CountryFeature | null);
        }}
        onPolygonClick={(country, event) => {
          if (event !== lastSignalPick.current) setSelectedCountry(country as CountryFeature);
        }}
        onGlobeClick={({ lat, lng }, event) => {
          if (event === lastSignalPick.current) return;
          const country = getCountryAtLocation(countries, lat, lng);
          if (country) setSelectedCountry(country);
        }}
        htmlElementsData={
          selectedStation &&
          Number.isFinite(selectedStation.geo_lat) &&
          Number.isFinite(selectedStation.geo_long)
            ? [selectedStation]
            : []
        }
        htmlElement={(station) => createStationMarker(station as RadioStation, genre)}
        htmlLat="geo_lat"
        htmlLng="geo_long"
        htmlAltitude={0.00001}
      />
      {ready && !selectedCountry && (
        <GlobePicker
          globeRef={ref}
          station={picker.station}
          genre={genre}
          moving={picker.moving}
          hasPlayer={Boolean(selectedStation)}
          onSelect={onSelectStation}
          onZoom={zoom}
          onReset={resetView}
        />
      )}
      {detailMap.tileUrl && (
        <div
          className={`pointer-events-auto absolute left-1/2 z-10 -translate-x-1/2 rounded bg-zinc-950/85 px-2 py-1 text-[10px] text-white/60 ${selectedStation ? 'bottom-[calc(var(--player-height,88px)+0.25rem)]' : 'bottom-1'}`}
        >
          ©{' '}
          <a
            href={
              import.meta.env.VITE_MAP_ATTRIBUTION_URL || 'https://www.openstreetmap.org/copyright'
            }
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white"
          >
            {import.meta.env.VITE_MAP_ATTRIBUTION || 'OpenStreetMap contributors'}
          </a>
        </div>
      )}
      {detailMap.failed && (
        <button
          onClick={detailMap.retry}
          className="absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-amber-300/20 bg-zinc-950/90 px-3 py-2 text-xs text-amber-200"
        >
          Map detail unavailable · Retry
        </button>
      )}
      {createPortal(
        <button
          onClick={startScan}
          disabled={!signalsReady}
          aria-label="Rescan station signals"
          title="Rescan station signals"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/15 bg-zinc-950/80 text-emerald-200/70 backdrop-blur-sm transition-colors hover:border-emerald-300/40 hover:text-emerald-100 disabled:opacity-30 sm:h-10 sm:w-10"
        >
          <Radar className="h-4 w-4" />
        </button>,
        document.getElementById('station-scan-control') ?? document.body
      )}
      {selectedCountry && (
        <CountryPanel
          name={getCountryName(selectedCountry)}
          stations={countryStations.stations}
          loading={countryStations.loading}
          loadingMore={countryStations.loadingMore}
          hasMore={countryStations.hasMore}
          error={countryStations.error}
          boundaryError={error}
          onRetry={countryStations.retry}
          onLoadMore={countryStations.loadMore}
          onClose={() => {
            setHoveredCountry(null);
            setSelectedCountry(null);
          }}
          onSelectStation={onSelectStation}
        />
      )}
    </div>
  );
}
