export interface OllamaResponse {
  response: string;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
  format?: JSONSchema;
  options?: {
    num_ctx?: number; // Context size
    num_predict?: number; // Number of tokens to predict
  };
}

export interface JSONSchema {
  type: string;
  enum?: any[]; // for enum types
  properties?: Record<string, JSONSchema>;
  required?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
}

export interface Article {
  title: string;
  description: string;
  text: string;
}

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  image?: string;
  [key: string]: any;
}

export interface RedditRssItem {
  title: string;
  link: string;
  published: string;
  content: string;

  // Computed fields (added after parsing)
  tickers?: string[];
}

export interface PriceInformation {
  ticker: string;
  currentPrice: number;
  yerstedayPrice: number;
  priceChange: number;
}

export interface CompanyOverview {
  Symbol: string;
  Name: string;
  Sector: string;
  Industry: string;
  Description: string;
  MarketCapitalization: number;
  RevenueTTM: number;
  PERatio: number;
  ForwardPE: number;
  DividendYield: number;
  DividendPerShare: number;
  EPS: number;
  ProfitMargin: number;
  OperatingMarginTTM: number;
  PriceInformation: StockPriceInfo;
}

export interface StockPriceInfo {
  Week52High: number;
  Week52Low: number;
  MovingAverage50Day: number;
  MovingAverage200Day: number;
  Beta: number;
  CurrentPrice: number;
  YesterdayPrice: number;
}
export interface RedditRssFeed {
  title: string;
  link: string;
  subtitle: string;
  entry: RedditRssItem[];
}

export interface RssFeed {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
}

export enum TenKSection {
  MDNA = "Item 7.    Management’s Discussion and Analysis of Financial Condition and Results of Operations",
  Business = "Item 1.    Business",
  RiskFactors = "Item 1A.    Risk Factors",
}