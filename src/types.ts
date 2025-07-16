export interface OllamaResponse {
  response: string;
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
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
}