import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

async function getPriceFromSymbol(symbol: string): Promise<number> {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data: any = await response.json();
    return data.c;
  } catch (error) {
    console.error("Error fetching company profile:", error);
    throw error;
  }
}

// replace the "demo" apikey below with your own key from https://www.alphavantage.co/support/#api-key
async function getYersterdayOpenPrice(symbol: string): Promise<number> {
    const response = await fetch(
        `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${process.env.ALPHAVANTAGE_API_KEY}&datatype=json&outputsize=2`
    );
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: any = await response.json();
    const timeSeries = data["Time Series (Daily)"];
    const dates = Object.keys(timeSeries);
    if (dates.length < 2) {
        throw new Error("Not enough data to get yesterday's price");
    }
    const yesterday = dates[0];
    return parseFloat(timeSeries[yesterday]["1. open"]);
}


const yesterdayPrice = await getYersterdayOpenPrice("AAPL");

const headers = {
  "User-Agent": "PaulGueripel poulbleu.du38@gmail.com",
  Accept: "application/json",
};

const TICKERS_FILE = path.join(process.cwd(), "assets/data/tickers.json");
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = 24 * 60 * 60 * 1000 * MAX_AGE_DAYS;

const newsSource =
  "https://www.reddit.com/r/wallstreetbets/search.rss?q=flair_name:%22News%22&restrict_sr=1&sort=new";

import { parseStringPromise } from "xml2js";
import fetch from "node-fetch";
import {
  RedditRssFeed,
  RedditRssItem,
  RssFeed,
  RssItem,
  TenKSection,
} from "../types";
import {
  getStrengthAndWeaknessesFromMDNA,
  queryAITickerListFromRedditPost,
} from "./ollama";

export async function fetchRssFeed(): Promise<RedditRssFeed> {
  const url = newsSource;
  const response = await fetch(url);
  const xml = await response.text();
  const parsed = await parseStringPromise(xml, { explicitArray: false });
  const feed: RedditRssFeed = parsed.feed;
  return feed;
}

async function getCompanyTickersFromSEC() {
  try {
    const stats = await fs.stat(TICKERS_FILE);
    const age = Date.now() - stats.mtimeMs;
    if (age > MAX_AGE_MS) throw new Error("Cache expired");
    const data = await fs.readFile(TICKERS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    const fetched = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      {
        headers,
      }
    );
    if (!fetched.ok) throw new Error("Failed to fetch tickers");
    console.log("SEC data fetched successfully");
    const json = await fetched.json();
    const tickersList = Object.values(json as any);
    await fs.writeFile(TICKERS_FILE, JSON.stringify(tickersList), "utf-8");
    return tickersList;
  }
}

async function getCIKFromTicker(ticker: string): Promise<string> {
  //get the list of tickers from the SEC
  const tickers = await getCompanyTickersFromSEC();
  //find the ticker in the list
  const cik = tickers.find((t: any) => t.ticker === ticker)?.cik_str;
  return String(cik);
}

async function getCompanySubmissions(cik: string): Promise<any> {
  cik = cik.padStart(10, "0"); // Ensure CIK is 10 digits
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch submissions for CIK ${cik}`);
  }
  const data = await response.json();
  return data;
}

async function get10KURLFromCIK(cik: string) {
  const submissions = await getCompanySubmissions(cik);
  const forms = submissions.filings.recent.form;
  const accessions = submissions.filings.recent.accessionNumber;
  const primaryDocuments = submissions.filings.recent.primaryDocument;

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "10-K") {
      const accNoDash = accessions[i].replace(/-/g, "");
      return `sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${primaryDocuments[i]}`;
    }
  }
  throw new Error("No 10-K found");
}

async function parse10K(url: string) {
  const res = await fetch(url, { headers: headers });
  if (!res.ok) throw new Error("Failed to fetch 10-K");
  const html = await res.text();

  const $ = cheerio.load(html);

  const sections: any = {};
  let currentSection: any = null;

  $("body")
    .find("*")
    .each((i, el) => {
      const text = $(el).text().trim();
      const match = text.match(/^Item\s+(\d+[A-Z]?)\.?\s+(.*)/i);
      if (match) {
        const itemNumber = match[1];
        const itemTitle = match[2];

        // Map to standardized section names
        if (
          itemNumber === "7" &&
          itemTitle.toLowerCase().includes("management")
        ) {
          currentSection = TenKSection.MDNA;
        }
        // else if (itemNumber === "1A" && itemTitle.toLowerCase().includes("risk")) {
        //   currentSection = TenKSection.RISK_FACTORS;
        // } else if (itemNumber === "1" && itemTitle.toLowerCase().includes("business")) {
        //   currentSection = TenKSection.BUSINESS;
        // }
        else {
          currentSection = match[0]; // Keep original for unmapped sections
        }

        sections[currentSection] = "";
      } else if (currentSection) {
        sections[currentSection] += text + "\n";
      }
    });

  return sections;
}
