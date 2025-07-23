import * as cheerio from "cheerio";
import fs from "fs/promises";
import path from "path";
import { CompanyOverview, PriceInformation, TenKSection } from "../../types.js";
import { CompanyOverviewCacheService } from "./company-overview-cache-service.js";
import { PriceService } from "./price-service.js";

const HEADERS = {
  "User-Agent": "PaulGueripel poulbleu.du38@gmail.com",
  "Accept": "application/json",
};

const SEC_HTML_HEADERS = {
  "User-Agent": "PaulGueripel poulbleu.du38@gmail.com",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const TICKERS_FILE = path.join(process.cwd(), "assets/data/tickers.json");
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = 24 * 60 * 60 * 1000 * MAX_AGE_DAYS;

export class CompanyDataService {
  /**
   * Gets company overview data, using cache when available
   * @param ticker - Stock ticker symbol
   * @returns Promise<CompanyOverview> - Company overview data
   */
  static async getCompanyOverview(ticker: string): Promise<CompanyOverview> {
    return await CompanyOverviewCacheService.getOrFetchOverview(
      ticker,
      () => this.fetchFreshCompanyOverview(ticker)
    );
  }

  /**
   * Fetches fresh company overview data from AlphaVantage API
   * @param ticker - Stock ticker symbol
   * @returns Promise<CompanyOverview> - Fresh company overview data
   */
  private static async fetchFreshCompanyOverview(ticker: string): Promise<CompanyOverview> {
    const response = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${process.env.ALPHAVANTAGE_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    if (!data.Symbol) {
      throw new Error(`No data found for ticker: ${ticker}`);
    }
    
    const priceInformation = await this.getPriceInformation(ticker);
    
    return {
      Symbol: data.Symbol,
      Name: data.Name,
      Sector: data.Sector,
      Industry: data.Industry,
      Description: data.Description,
      MarketCapitalization: parseFloat(data.MarketCapitalization),
      RevenueTTM: parseFloat(data.RevenueTTM),
      PERatio: parseFloat(data.PERatio),
      ForwardPE: parseFloat(data.ForwardPE),
      DividendYield: parseFloat(data.DividendYield) || 0,
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
  }

  /**
   * Gets comprehensive price information for a ticker
   * @param ticker - Stock ticker symbol
   * @returns Promise<PriceInformation> - Price data including current, yesterday, and change
   */
  static async getPriceInformation(ticker: string): Promise<PriceInformation> {
    const { current, yesterday } = await PriceService.getBothPrices(ticker);
    const priceChange = ((current - yesterday) / yesterday) * 100;
    
    return {
      ticker,
      currentPrice: current,
      yerstedayPrice: yesterday,
      priceChange,
    };
  }

  static async getCIKFromTicker(ticker: string): Promise<string> {
    const tickers = await this.getCompanyTickersFromSEC();
    const cik = tickers.find((t: any) => t.ticker === ticker)?.cik_str;
    return String(cik);
  }

  static async get10KContent(ticker: string): Promise<any> {
    const cik = await this.getCIKFromTicker(ticker);
    if (!cik || cik === "undefined") {
      throw new Error(`No CIK found for ticker ${ticker}`);
    }

    const url = await this.get10KURLFromCIK(cik);
    console.log(`Fetching 10-K from URL: ${url}`);
    return await this.parse10K(url);
  }

  private static async getCompanyTickersFromSEC() {
    try {
      const stats = await fs.stat(TICKERS_FILE);
      const age = Date.now() - stats.mtimeMs;
      if (age > MAX_AGE_MS) throw new Error("Cache expired");
      
      const data = await fs.readFile(TICKERS_FILE, "utf-8");
      return JSON.parse(data);
    } catch {
      const response = await fetch(
        "https://www.sec.gov/files/company_tickers.json",
        { headers: HEADERS }
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch tickers");
      }
      
      console.log("SEC data fetched successfully");
      const json = await response.json();
      const tickersList = Object.values(json);
      
      await fs.writeFile(TICKERS_FILE, JSON.stringify(tickersList), "utf-8");
      return tickersList;
    }
  }

  private static async getCompanySubmissions(cik: string): Promise<any> {
    cik = cik.padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const response = await fetch(url, { headers: HEADERS });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch submissions for CIK ${cik}`);
    }
    
    return await response.json();
  }

  private static async get10KURLFromCIK(cik: string): Promise<string> {
    const submissions = await this.getCompanySubmissions(cik);
    const { form: forms, accessionNumber: accessions, primaryDocument: primaryDocuments } = submissions.filings.recent;

    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === "10-K") {
        const accNoDash = accessions[i].replace(/-/g, "");
        return `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/${primaryDocuments[i]}`;
      }
    }
    
    throw new Error("No 10-K found");
  }

  private static async parse10K(url: string): Promise<any> {
    const response = await fetch(url, { headers: SEC_HTML_HEADERS });
    if (!response.ok) {
      throw new Error("Failed to fetch 10-K");
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const sections: any = {};
    let currentSection: any = null;

    $("body").find("*").each((i, el) => {
      const text = $(el).text().trim();
      const match = text.match(/^Item\s+(\d+[A-Z]?)\.?\s+(.*)/i);
      
      if (match) {
        const [, itemNumber, itemTitle] = match;
        
        if (itemNumber === "7" && itemTitle.toLowerCase().includes("management")) {
          currentSection = TenKSection.MDNA;
        }
        else if (itemNumber === "1" && itemTitle.toLowerCase().includes("business")) {
          currentSection = TenKSection.Business;
        }
        else if (itemNumber === "1A" && itemTitle.toLowerCase().includes("risk factors")) {
          currentSection = TenKSection.RiskFactors;
        }
        else {
          currentSection = match[0];
        }
        
        sections[currentSection] = "";
      } else if (currentSection) {
        sections[currentSection] += text + "\n";
      }
    });

    return sections;
  }
}