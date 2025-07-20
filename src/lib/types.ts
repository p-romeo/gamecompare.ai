export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface GameSummary {
  id: string;
  title: string;
  price: number;
  score: number;
  platforms: string[];
  storeLinks?: StoreLink[];
}

export interface StoreLink {
  store: string;
  url: string;
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