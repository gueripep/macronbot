import fs from "fs/promises";
import path, { parse } from "path";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

async function getPriceFromSymbol(symbol: string): Promise<number> {
  const db = (await import("../dbSetup")).default;
  
  // Check if we have a recent price in the database
  const cachedPrice = db.prepare(`
    SELECT price, last_updated FROM prices WHERE ticker = ?
  `).get(symbol);
  
  if (cachedPrice) {
    const lastUpdated = new Date(cachedPrice.last_updated);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
    
    // If price is less than 24 hours old, use cached price
    if (hoursSinceUpdate < 24) {
      console.log(`Using cached price for ${symbol}: $${cachedPrice.price} (${hoursSinceUpdate.toFixed(1)} hours old)`);
      return cachedPrice.price;
    }
  }
  
  // Fetch fresh price from API
  try {
    console.log(`Fetching fresh price for ${symbol} from API...`);
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data: any = await response.json();
    
    const currentPrice = data.c;
    const timestamp = new Date().toISOString();
    
    // Store/update the price in database
    db.prepare(`
      INSERT OR REPLACE INTO prices (ticker, price, last_updated)
      VALUES (?, ?, ?)
    `).run(symbol, currentPrice, timestamp);
    
    console.log(`Cached fresh price for ${symbol}: $${currentPrice}`);
    return currentPrice;
    
  } catch (error) {
    console.error(`Error fetching price for ${symbol}:`, error);
    
    // If API fails and we have any cached price (even old), use it
    if (cachedPrice) {
      console.log(`API failed, using stale cached price for ${symbol}: $${cachedPrice.price}`);
      return cachedPrice.price;
    }
    
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
  JSONSchema,
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
  queryAITradeExplanation,
} from "./ollama";
import { EmbedBuilder } from "discord.js";

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

export async function trade(): Promise<string | null> {
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
          // Step 9: Save the trading decision with buy_price
          const stmt = db.prepare(`
            INSERT INTO transactions (decision, ticker, amount_invested, buy_price, leverage, start_date, end_date, summary, confidence)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          stmt.run(
            tradingDecision.decision,
            ticker,
            tradingDecision.amountToInvest,
            priceInfo.currentPrice, // Store the actual buy price
            tradingDecision.suggestedLeverage,
            tradingDecision.startDate,
            tradingDecision.endDate,
            tradingDecision.summary,
            tradingDecision.confidenceLevel
          );
          console.log(`Trading decision for ${ticker} saved to database with buy price: $${priceInfo.currentPrice}`);

          // Step 10: Update available money
          const newAvailableMoney =
            availableMoney - (tradingDecision.amountToInvest ?? 0);
          db.prepare("UPDATE money SET available = ? WHERE id = 1").run(
            newAvailableMoney
          );
          console.log(`Available money updated to: ${newAvailableMoney}`);

          // Success! We found a working post and ticker
          const successMessage = queryAITradeExplanation(tradingDecision, ticker);
          return successMessage;
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

// Add this helper function
async function getInvestedAmount(db: any): Promise<number> {
  const currentDate = new Date().toISOString().split('T')[0];
  
  const activeTransactions = db.prepare(`
    SELECT * FROM transactions 
    WHERE end_date > ?
  `).all(currentDate);
  
  if (activeTransactions.length === 0) {
    return 0;
  }
  
  // Get current prices for all active tickers
  const uniqueTickers: any[] = [...new Set(activeTransactions.map((t: any) => t.ticker))];
  const currentPrices = await getPricesFromSymbols(uniqueTickers);
  
  let totalCurrentValue = 0;
  
  for (const transaction of activeTransactions) {
    const currentPrice = currentPrices[transaction.ticker];
    
    if (currentPrice) {
      const entryPrice = transaction.buy_price;
      let pnlPercentage: number;
      
      // Calculate P&L based on position type
      if (transaction.decision === 'Long') {
        pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100 * transaction.leverage;
      } else { // Short
        pnlPercentage = ((entryPrice - currentPrice) / entryPrice) * 100 * transaction.leverage;
      }
      
      // Current value = initial investment + (initial investment * P&L percentage)
      const currentValue = transaction.amount_invested * (1 + pnlPercentage / 100);
      totalCurrentValue += currentValue;
      
      console.log(`${transaction.ticker}: $${transaction.amount_invested} → $${currentValue.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
    } else {
      // If we can't get current price, use the original investment amount
      totalCurrentValue += transaction.amount_invested;
      console.log(`${transaction.ticker}: Using original investment $${transaction.amount_invested} (price unavailable)`);
    }
  }
  
  return totalCurrentValue;
}

// Update this function to be async as well
async function getTotalPortfolioValue(db: any): Promise<number> {
  const money = db.prepare("SELECT available FROM money WHERE id = 1").get();
  const invested = await getInvestedAmount(db);
  return money.available + invested;
}

export async function getPortfolioEmbed(): Promise<EmbedBuilder> {
  const db = (await import("../dbSetup")).default;
  const currentDate = new Date().toISOString().split('T')[0];
  
  // Get active transactions
  const activeTransactions = db.prepare(`
    SELECT * FROM transactions 
    WHERE end_date > ? 
    ORDER BY start_date DESC
  `).all(currentDate);
  
  const money = db.prepare("SELECT available FROM money WHERE id = 1").get();
  const invested = await getInvestedAmount(db); // Now async
  const totalPortfolio = await getTotalPortfolioValue(db); // Now async

  const embed = new EmbedBuilder()
    .setTitle("📊 Portfolio de Trading - Emmanuel Macron")
    .setColor(0x0099FF)
    .setTimestamp()
    .addFields(
      { name: "💰 Argent Disponible", value: `$${money.available.toFixed(2)}`, inline: true },
      { name: "📈 Valeur Investie", value: `$${invested.toFixed(2)}`, inline: true }, // Changed label to reflect current value
      { name: "📊 Total Portfolio", value: `$${totalPortfolio.toFixed(2)}`, inline: true }
    );

  if (activeTransactions.length === 0) {
    embed.setDescription("Aucune position active actuellement. En même temps, il faut savoir attendre les bonnes opportunités !");
    return embed;
  }

  // Get all unique tickers and fetch their prices efficiently
  const uniqueTickers: any = [...new Set(activeTransactions.map((t: any) => t.ticker))];
  const currentPrices = await getPricesFromSymbols(uniqueTickers);

  let totalPnL = 0;
  let totalOriginalInvestment = 0;
  let portfolioFields: any[] = [];

  // Process each active transaction
  for (const transaction of activeTransactions) {
    const currentPrice = currentPrices[transaction.ticker];
    totalOriginalInvestment += transaction.amount_invested;
    
    if (currentPrice) {
      // Use the stored buy_price
      const entryPrice = transaction.buy_price;
      
      // Calculate P&L based on position type
      let pnlPercentage: number;
      let pnlDollar: number;
      
      if (transaction.decision === 'Long') {
        pnlPercentage = ((currentPrice - entryPrice) / entryPrice) * 100 * transaction.leverage;
      } else { // Short
        pnlPercentage = ((entryPrice - currentPrice) / entryPrice) * 100 * transaction.leverage;
      }
      
      pnlDollar = (transaction.amount_invested * pnlPercentage) / 100;
      const currentValue = transaction.amount_invested + pnlDollar;
      totalPnL += pnlDollar;

      // Determine color and emoji based on P&L
      const isProfit = pnlPercentage >= 0;
      const emoji = isProfit ? "🟢" : "🔴";
      const sign = isProfit ? "+" : "";
      
      // Format the field with current value
      const fieldValue = [
        `**Position:** ${transaction.decision} ${transaction.leverage}x`,
        `**Investi:** $${transaction.amount_invested.toFixed(2)}`,
        `**Valeur Actuelle:** $${currentValue.toFixed(2)}`,
        `**Prix d'Achat:** $${entryPrice.toFixed(2)}`,
        `**Prix Actuel:** $${currentPrice.toFixed(2)}`,
        `**P&L:** ${emoji} ${sign}${pnlPercentage.toFixed(2)}% (${sign}$${pnlDollar.toFixed(2)})`,
        `**Fin:** ${transaction.end_date}`
      ].join('\n');

      portfolioFields.push({
        name: `${emoji} ${transaction.ticker.toUpperCase()}`,
        value: fieldValue,
        inline: true
      });
    } else {
      // Add field with error state
      portfolioFields.push({
        name: `⚠️ ${transaction.ticker.toUpperCase()}`,
        value: [
          `**Position:** ${transaction.decision} ${transaction.leverage}x`,
          `**Investi:** $${transaction.amount_invested.toFixed(2)}`,
          `**Prix d'Achat:** $${transaction.buy_price.toFixed(2)}`,
          `**Status:** Erreur de prix`,
          `**Fin:** ${transaction.end_date}`
        ].join('\n'),
        inline: true
      });
    }
  }

  // Add all portfolio fields
  embed.addFields(...portfolioFields);

  // Add total P&L summary based on original investment
  const totalPnLPercentage = totalOriginalInvestment > 0 ? (totalPnL / totalOriginalInvestment) * 100 : 0;
  const totalEmoji = totalPnL >= 0 ? "🟢" : "🔴";
  const totalSign = totalPnL >= 0 ? "+" : "";
  
  embed.addFields({
    name: "📊 Performance Totale",
    value: [
      `**P&L Total:** ${totalEmoji} ${totalSign}${totalPnLPercentage.toFixed(2)}% (${totalSign}$${totalPnL.toFixed(2)})`,
      `**Investi Original:** $${totalOriginalInvestment.toFixed(2)}`,
      `**Valeur Actuelle:** $${invested.toFixed(2)}`
    ].join('\n'),
    inline: false
  });

  // Add a footer with Macron-style message
  const macronMessages = [
    "Investir c'est prendre des risques calculés !",
    "Il faut assumer ses positions et avancer avec détermination !",
    "#startupnation",
    "Nous devons être ambitieux dans nos investissements !"
  ];
  
  const randomMessage = macronMessages[Math.floor(Math.random() * macronMessages.length)];
  embed.setFooter({ text: randomMessage });

  return embed;
}

async function getPricesFromSymbols(symbols: string[]): Promise<{ [ticker: string]: number }> {
  const db = (await import("../dbSetup")).default;
  const prices: { [ticker: string]: number } = {};
  const symbolsToFetch: string[] = [];
  
  // Check cached prices first
  for (const symbol of symbols) {
    const cachedPrice = db.prepare(`
      SELECT price, last_updated FROM prices WHERE ticker = ?
    `).get(symbol);
    
    if (cachedPrice) {
      const lastUpdated = new Date(cachedPrice.last_updated);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate < 24) {
        prices[symbol] = cachedPrice.price;
        console.log(`Using cached price for ${symbol}: $${cachedPrice.price}`);
      } else {
        symbolsToFetch.push(symbol);
      }
    } else {
      symbolsToFetch.push(symbol);
    }
  }
  
  // Fetch prices for symbols that need updating
  for (const symbol of symbolsToFetch) {
    try {
      const price = await getPriceFromSymbol(symbol);
      prices[symbol] = price;
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      // Skip this symbol if we can't get its price
    }
  }
  
  return prices;
}