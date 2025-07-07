export interface GameSummary {
  id: string;
  title: string;
  price: number;
  score: number;
  platforms: string[];
}

export interface GameDetail extends GameSummary {
  description: string;
  genres: string[];
  playtime: number;
}

export interface FilterState {
  playtimeMax?: number;
  priceMax?: number;
  platforms?: string[];
  yearRange?: [number, number];
}