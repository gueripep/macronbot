import fetch from "node-fetch"; // If Node.js < 18, or for explicit import
import * as cheerio from "cheerio";
import { RssItem } from "./macronNews";

export interface Article {
  title: string;
  description: string;
  text: string;
}

export async function scrapeArticle(rssItem: RssItem): Promise<Article> {
  try {
    // 1. Fetch the HTML content
    const response = await fetch(rssItem.link);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${rssItem.link}: ${response.statusText}`);
    }

    const html = await response.text();

    // 2. Load the HTML into Cheerio
    const $ = cheerio.load(html);

    let article: Article;

    // 3. Use Cheerio selectors to find and extract data
    const text = $("article .c-body").first().text().trim();
    article = {
        title: rssItem.title,
        description: rssItem.description || "No description available.",
        text: text || "No content available.",
    }

    return article;
  } catch (error) {
    console.error("Error during scraping:", error);
    return { title: "", description: "", text: "" };
  }
}