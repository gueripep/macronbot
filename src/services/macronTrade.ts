import fs from "fs/promises";
import path, { parse } from "path";
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

async function getCompanyOverview(ticker: string): Promise<CompanyOverview> {
  try {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${process.env.ALPHAVANTAGE_API_KEY}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data: any = await response.json();
    if (!data.Symbol) {
      throw new Error(`No data found for ticker: ${ticker}`);
    }
    const priceInformation = await getPriceInformation(ticker);
    const companiesOverview: CompanyOverview = {
      Symbol: data.Symbol,
      Name: data.Name,
      Sector: data.Sector,
      Industry: data.Industry,
      Description: data.Description,
      MarketCapitalization: parseFloat(data.MarketCapitalization),
      RevenueTTM: parseFloat(data.RevenueTTM),
      PERatio: parseFloat(data.PERatio),
      ForwardPE: parseFloat(data.ForwardPE),
      DividendYield: parseFloat(data.DividendYield) || 0, //not ?? because value is NaN, not undefined
      DividendPerShare: parseFloat(data.DividendPerShare) || 0,
      EPS: parseFloat(data.EPS),
      ProfitMargin: parseFloat(data.ProfitMargin),
      OperatingMarginTTM: parseFloat(data.OperatingMarginTTM),
      PriceInformation: {
        Week52High: parseFloat(data["52WeekHigh"]),
        Week52Low: parseFloat(data["52WeekLow"]),
        MovingAverage50Day: parseFloat(data["50DayMovingAverage"]),
        MovingAverage200Day: parseFloat(data["200DayMovingAverage"]),
        Beta: parseFloat(data.Beta),
        CurrentPrice: priceInformation.currentPrice,
        YesterdayPrice: priceInformation.yerstedayPrice,
      },
    };
    return companiesOverview;
  } catch (error) {
    console.error("Error fetching company profile:", error);
    throw error;
  }
}

const headers = {
  "User-Agent": "PaulGueripel poulbleu.du38@gmail.com",
  Accept: "application/json",
};

const secHtmlHeaders = {
  "User-Agent": "PaulGueripel poulbleu.du38@gmail.com",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const TICKERS_FILE = path.join(process.cwd(), "assets/data/tickers.json");
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = 24 * 60 * 60 * 1000 * MAX_AGE_DAYS;

const newsSource =
  "https://www.reddit.com/r/wallstreetbets/search.rss?q=flair_name:%22Discussion%22&restrict_sr=1&sort=new";

import { parseStringPromise } from "xml2js";
import fetch from "node-fetch";
import {
  CompanyOverview,
  PriceInformation,
  RedditRssFeed,
  RedditRssItem,
  RssFeed,
  RssItem,
  TenKSection,
} from "../types";
import {
  getStrengthAndWeaknessesFromMDNA,
  queryAIMarketDecision,
  queryAISentiment,
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
  const secureUrl = `https://${url}`;
  const res = await fetch(secureUrl, { headers: secHtmlHeaders });
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

async function getPriceInformation(ticker: string): Promise<PriceInformation> {
  const yesterdayPrice = await getYersterdayOpenPrice(ticker);
  const currentPrice = await getPriceFromSymbol(ticker);
  const priceChange = ((currentPrice - yesterdayPrice) / yesterdayPrice) * 100;

  return {
    ticker,
    currentPrice,
    yerstedayPrice: yesterdayPrice,
    priceChange,
  };
}

export async function trade() {
  const feed = await fetchRssFeed();

  for (const item of feed.entry) {
    try {
      console.log(`Processing Reddit post: ${item.title}`);

      // Step 1: Extract tickers from the post
      const tickers = await queryAITickerListFromRedditPost(item);
      if (!tickers || tickers.length === 0) {
        console.log("No tickers found in this post, trying next...");
        continue;
      }

      const redditPostWithTickers = { ...item, tickers };
      console.log(`Found tickers: ${tickers.join(", ")}`);

      // Step 2: Try each ticker in the post
      for (const ticker of tickers) {
        try {
          console.log(`Processing ticker: ${ticker}`);

          // Step 3: Get CIK from ticker
          const cik = await getCIKFromTicker(ticker);
          if (!cik || cik === "undefined") {
            console.log(
              `No CIK found for ticker ${ticker}, trying next ticker...`
            );
            continue;
          }

          // Step 4: Get 10-K URL
          const url = await get10KURLFromCIK(cik);
          if (!url) {
            console.log(
              `No 10-K found for ticker ${ticker}, trying next ticker...`
            );
            continue;
          }

          // Step 5: Parse 10-K
          const tenKSections = await parse10K(url);
          const mdna = tenKSections[TenKSection.MDNA];
          if (!mdna || mdna.trim().length === 0) {
            console.log(
              `No MD&A section found for ticker ${ticker}, trying next ticker...`
            );
            continue;
          }

          // Step 6: Get financial analysis
          const strengthsAndWeaknesses = await getStrengthAndWeaknessesFromMDNA(
            mdna
          );
          console.log(
            `Strengths and weaknesses for ${ticker}: ${strengthsAndWeaknesses}`
          );

          // Step 7: Get price information
          const priceInfo = await getPriceInformation(ticker);
          console.log(`Price information for ${ticker}:`, priceInfo);

          const companyOverview = await getCompanyOverview(ticker);
          console.log(`Company overview for ${ticker}:`, companyOverview);
          // Step 8: Generate sentiment analysis
          const sentiment = await queryAISentiment(
            redditPostWithTickers,
            strengthsAndWeaknesses,
            companyOverview
          );

          console.log(`Successfully processed ticker ${ticker}`);
          console.log(`Sentiment: ${sentiment}`);

          //get the amount available to invest from the database
          const db = (await import("../dbSetup")).default;
          const availableMoney = db
            .prepare("SELECT available FROM money WHERE id = 1")
            .get().available;
          console.log(`Available money: ${availableMoney}`);

          const tradingDecision = JSON.parse(
            await queryAIMarketDecision(sentiment, availableMoney)
          );

          console.log(`Trading decision for ${ticker}:`, tradingDecision);
          // Step 9: Save the trading decision
          const stmt = db.prepare(`
            INSERT INTO transactions (decision, ticker, amount_invested, leverage, start_date, end_date, summary, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            tradingDecision.decision,
            ticker,
            tradingDecision.amountToInvest,
            tradingDecision.suggestedLeverage,
            tradingDecision.startDate,
            tradingDecision.endDate,
            tradingDecision.summary,
            tradingDecision.confidenceLevel
          );
          console.log(`Trading decision for ${ticker} saved to database`);

          // Step 10: Update available money
          const newAvailableMoney =
            availableMoney - (tradingDecision.amountToInvest ?? 0);
          db.prepare("UPDATE money SET available = ? WHERE id = 1").run(
            newAvailableMoney
          );
          console.log(`Available money updated to: ${newAvailableMoney}`);

          // Success! We found a working post and ticker
          return {
            redditPost: redditPostWithTickers,
            ticker,
            cik,
            url,
            mdna,
            strengthsAndWeaknesses,
            priceInfo,
            sentiment,
          };
        } catch (tickerError) {
          console.error(`Error processing ticker ${ticker}:`, tickerError);
          console.log(`Trying next ticker...`);
          continue;
        }
      }
    } catch (postError) {
      console.error(`Error processing Reddit post "${item.title}":`, postError);
      console.log(`Trying next Reddit post...`);
      continue;
    }
  }

  console.log("No Reddit posts could be successfully processed");
  return null;
}
