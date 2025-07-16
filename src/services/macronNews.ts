import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { queryMacronNews as queryMacronAINews } from "./ollama";
import fs from "fs";
import path from "path";
import { BaseMessageOptions, AttachmentBuilder } from "discord.js";
import { scrapeArticle } from "./scraper";

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  image?: string;
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
      image: item.enclosure.$.url,
    })),
  };
}

async function fetchMostImportantNews(newsNb: number): Promise<RssItem[]> {
  const rssFeed = await fetchRssFeed();
  return rssFeed.items.slice(0, newsNb);
}

async function getNewsString(mostImportantNews: RssItem[]) {
	
  return mostImportantNews
    .map(
      (news, idx) =>
        `News numéro ${idx + 1} :\n${news.title}\n${
          news.description || "Pas de description disponible."
        }`
    )
    .join("\n\n");
}

async function getNewsImages(rssItems: RssItem[]): Promise<string[]> {
  //save the image locally from the rss feed returns the local path list
  const imagePaths: string[] = [];
  const imageDir = path.join(process.cwd(), "images");

  // Create images directory if it doesn't exist
  if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir, { recursive: true });
  }

  for (let i = 0; i < rssItems.length; i++) {
    const item = rssItems[i];

    try {
      let imageUrl = item.image;

      if (imageUrl) {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const extension = path.extname(new URL(imageUrl).pathname) || ".jpg";
          const filename = `news_${i + 1}_${Date.now()}${extension}`;
          const filePath = path.join(imageDir, filename);

          fs.writeFileSync(filePath, Buffer.from(buffer));
          imagePaths.push(filePath);
          console.log(`Image saved: ${filePath}`);
        }
      }
    } catch (error) {
      console.error(`Error downloading image for news ${i + 1}:`, error);
    }
  }
  imagePaths.push(path.join(process.cwd(), "images/logo_macronnews.png")); // Add a default image if needed
  return imagePaths;
}

export async function getMacronNews(): Promise<BaseMessageOptions> {
  const mostImportantNews = await fetchMostImportantNews(1);
  const images = await getNewsImages(mostImportantNews);
  const article = await scrapeArticle(mostImportantNews[0]);
  
  const macronNews = await queryMacronAINews(article);
  
  const message: BaseMessageOptions = {
    content: macronNews,
    files: images.map((imagePath) => new AttachmentBuilder(imagePath)),
    // embeds: mostImportantNews.map((news, index) => ({
    //   color: 0x0099FF, // Blue color for embeds
    //   title: news.title,
    //   description: news.description || "Pas de description disponible.",
    //   url: news.link,
    //   image: images[index] ? {
    //     url: `attachment://${path.basename(images[index])}`
    //   } : undefined,
    //   timestamp: new Date(news.pubDate).toISOString(),
    // })).filter(embed => embed.image) // Only include embeds that have images
  };
  
  console.log("Macron's response:", macronNews);
  return message;
}
