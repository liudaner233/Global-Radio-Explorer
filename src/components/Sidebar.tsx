import React, { useState, useEffect } from 'react';
import { Search, Radio, Globe, MapPin, ChevronRight, Loader2, Music } from 'lucide-react';
import { RadioStation } from '../types/radio';
import { cn } from '../lib/utils';

interface SidebarProps {
  onStationSelect: (station: RadioStation) => void;
  currentStation: RadioStation | null;
}

const Sidebar: React.FC<SidebarProps> = ({ onStationSelect, currentStation }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'trending'>('trending');

  const fetchStations = async (query: string = '', isTrending: boolean = false) => {
    setLoading(true);
    try {
      let url = 'https://de1.api.radio-browser.info/json/stations/';
      if (isTrending) {
        url += 'topclick/50';
      } else if (query) {
        url += `byname/${encodeURIComponent(query)}`;
      } else {
        url += 'lastclick/50';
      }
      
      const response = await fetch(url);
      const data = await response.json();
      setStations(data);
    } catch (error) {
      console.error('Error fetching stations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStations('', true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab('search');
      fetchStations(searchQuery);
    }
  };

  return (
    <div className="fixed top-4 left-4 bottom-24 w-80 md:w-96 bg-zinc-900 border border-white/10 rounded-2xl flex flex-col z-40 overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Radio className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Radio Explorer</h1>
            <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">Global Waves</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Search stations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </form>
      </div>

      <div className="flex px-6 gap-4 border-b border-white/5">
        <button
          onClick={() => { setActiveTab('trending'); fetchStations('', true); }}
          className={cn(
            "pb-3 text-sm font-medium transition-all relative",
            activeTab === 'trending' ? "text-blue-400" : "text-white/40 hover:text-white/60"
          )}
        >
          Trending
          {activeTab === 'trending' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full" />}
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={cn(
            "pb-3 text-sm font-medium transition-all relative",
            activeTab === 'search' ? "text-blue-400" : "text-white/40 hover:text-white/60"
          )}
        >
          Results
          {activeTab === 'search' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-full" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/40">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Tuning in...</p>
          </div>
        ) : stations.length > 0 ? (
          <div className="space-y-1">
            {stations.map((station) => (
              <button
                key={station.stationuuid}
                onClick={() => onStationSelect(station)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all group text-left",
                  currentStation?.stationuuid === station.stationuuid
                    ? "bg-blue-500/20 border border-blue-500/30"
                    : "hover:bg-white/5 border border-transparent"
                )}
              >
                <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center overflow-hidden border border-white/10 shrink-0 group-hover:border-white/20 transition-colors">
                  {station.favicon ? (
                    <img src={station.favicon} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <Music className="w-5 h-5 text-white/20" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={cn(
                    "text-sm font-medium truncate",
                    currentStation?.stationuuid === station.stationuuid ? "text-blue-400" : "text-white"
                  )}>
                    {station.name}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-wider font-bold">
                    <span className="flex items-center gap-0.5">
                      <Globe className="w-2.5 h-2.5" />
                      {station.countrycode}
                    </span>
                    {station.bitrate > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Radio className="w-2.5 h-2.5" />
                        {station.bitrate}k
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className={cn(
                  "w-4 h-4 transition-transform",
                  currentStation?.stationuuid === station.stationuuid ? "text-blue-400 translate-x-0" : "text-white/10 -translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                )} />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-white/20 p-8 text-center">
            <Radio className="w-12 h-12 opacity-10" />
            <p className="text-sm">No stations found. Try searching for something else.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
