import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { queryMacronNews } from "./ollama";

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  [key: string]: any;
}

export interface RssFeed {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
}

export async function fetchRssFeed(): Promise<RssFeed> {
  const url = "https://www.francetvinfo.fr/titres.rss";
  const response = await fetch(url);
  const xml = await response.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const channel = parsed.rss.channel;
  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  return {
    title: channel.title,
    link: channel.link,
    description: channel.description,
    items: items.map((item: any) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      description: item.description,
    })),
  };
}

async function fetchMostImportantNews(newsNb: number): Promise<RssItem[]> {
  const rssFeed = await fetchRssFeed();
  return rssFeed.items.slice(0, newsNb);
}

async function getNewsString() {
  const mostImportantNews = await fetchMostImportantNews(3);
  return mostImportantNews
    .map((news, idx) => `News numéro ${idx + 1} :\n${news.title}\n${news.description || "Pas de description disponible."}`)
    .join("\n\n");
}

export async function getMacronNews(): Promise<string> {
  const mostImportantNewsString = await getNewsString();

  const macronNews = await queryMacronNews(mostImportantNewsString);
  console.log("Macron's response:", macronNews);
  return macronNews;
}
