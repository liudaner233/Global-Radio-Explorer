export interface RadioStation {
  changeid: string;
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  iso_3166_2: string | null;
  state: string;
  language: string;
  languagecodes: string;
  votes: number;
  lastchangetime: string;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  lastchecktime: string;
  lastcheckoktime: string;
  lastlocalchecktime: string;
  clickcount: number;
  clickcount_day: number;
  clickcount_week: number;
  clickcount_month: number;
  clicktimestamp: string;
  clicktimestamp_day: string;
  clicktimestamp_week: string;
  clicktimestamp_month: string;
  geo_lat: number | null;
  geo_long: number | null;
  has_extended_info: boolean;
}

export interface Country {
  name: string;
  iso_3166_1: string;
  stationcount: number;
}
