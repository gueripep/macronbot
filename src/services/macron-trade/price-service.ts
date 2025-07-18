import dotenv from "dotenv";

dotenv.config();

/**
 * Service for fetching and caching stock price data from multiple APIs
 * Provides current prices and historical data with intelligent caching
 */
export class PriceService {
  
  /**
   * Gets the database connection instance
   * @returns Database connection object
   */
  private static async getDB() {
    return (await import("../../dbSetup")).default;
  }

  /**
   * Gets current price for a symbol, using cache when available
   * @param symbol - Stock ticker symbol
   * @returns Promise<number> - Current stock price
   */
  static async getPriceFromSymbol(symbol: string): Promise<number> {
    const db = await this.getDB();
    
    // Check cache first
    const cachedPrice = db.prepare(`
      SELECT current_price, last_updated FROM prices WHERE ticker = ?
    `).get(symbol);
    
    if (cachedPrice && this.isCacheValid(cachedPrice.last_updated)) {
      console.log(`Using cached current price for ${symbol}: $${cachedPrice.current_price}`);
      return cachedPrice.current_price;
    }
    
    // Fetch fresh price
    try {
      const currentPrice = await this.fetchFreshCurrentPrice(symbol);
      await this.updateCurrentPrice(symbol, currentPrice);
      return currentPrice;
    } catch (error) {
      console.error(`Error fetching current price for ${symbol}:`, error);
      
      // Fallback to stale cache if API fails
      if (cachedPrice) {
        console.log(`API failed, using stale cache for ${symbol}: $${cachedPrice.current_price}`);
        return cachedPrice.current_price;
      }
      throw error;
    }
  }

  /**
   * Gets yesterday's opening price for a symbol, using cache when available
   * @param symbol - Stock ticker symbol
   * @returns Promise<number> - Yesterday's opening price
   */
  static async getYesterdayOpenPrice(symbol: string): Promise<number> {
    const db = await this.getDB();
    
    // Check cache first
    const cachedPrice = db.prepare(`
      SELECT yesterday_price, last_updated FROM prices WHERE ticker = ?
    `).get(symbol);
    
    if (cachedPrice && cachedPrice.yesterday_price && this.isHistoricalCacheValid(cachedPrice.last_updated)) {
      console.log(`Using cached yesterday price for ${symbol}: $${cachedPrice.yesterday_price}`);
      return cachedPrice.yesterday_price;
    }
    
    // Fetch fresh yesterday price
    try {
      const yesterdayPrice = await this.fetchFreshYesterdayPrice(symbol);
      await this.updateYesterdayPrice(symbol, yesterdayPrice);
      return yesterdayPrice;
    } catch (error) {
      console.error(`Error fetching yesterday price for ${symbol}:`, error);
      
      // Fallback to stale cache if API fails
      if (cachedPrice && cachedPrice.yesterday_price) {
        console.log(`API failed, using stale yesterday cache for ${symbol}: $${cachedPrice.yesterday_price}`);
        return cachedPrice.yesterday_price;
      }
      throw error;
    }
  }

  /**
   * Gets prices for multiple symbols efficiently
   * @param symbols - Array of stock ticker symbols
   * @returns Promise<{ [ticker: string]: number }> - Object mapping tickers to current prices
   */
  static async getPricesFromSymbols(symbols: string[]): Promise<{ [ticker: string]: number }> {
    const prices: { [ticker: string]: number } = {};
    
    for (const symbol of symbols) {
      try {
        prices[symbol] = await this.getPriceFromSymbol(symbol);
      } catch (error) {
        console.error(`Failed to get price for ${symbol}:`, error);
      }
    }
    
    return prices;
  }

  /**
   * Checks if current price cache is still valid (within 1 hour during market hours, 24 hours otherwise)
   * @param lastUpdated - ISO timestamp of last update
   * @returns boolean - True if cache is valid
   */
  private static isCacheValid(lastUpdated: string): boolean {
    const lastUpdateTime = new Date(lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60);
    
    // During market hours (9:30 AM - 4:00 PM EST), cache for 1 hour
    // Outside market hours, cache for 24 hours
    const currentHour = now.getHours();
    const isMarketHours = currentHour >= 9 && currentHour <= 16;
    
    return hoursSinceUpdate < (isMarketHours ? 1 : 24);
  }

  /**
   * Checks if historical price cache is still valid (within 24 hours)
   * Historical prices don't change, so longer cache is acceptable
   * @param lastUpdated - ISO timestamp of last update
   * @returns boolean - True if cache is valid
   */
  private static isHistoricalCacheValid(lastUpdated: string): boolean {
    const lastUpdateTime = new Date(lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate < 24; // Cache historical prices for 24 hours
  }

  /**
   * Fetches fresh current price from Finnhub API
   * @param symbol - Stock ticker symbol
   * @returns Promise<number> - Current stock price
   */
  private static async fetchFreshCurrentPrice(symbol: string): Promise<number> {
    console.log(`Fetching fresh current price for ${symbol} from Finnhub API...`);
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.c; // Current price
  }

  /**
   * Fetches fresh yesterday's opening price from AlphaVantage API
   * @param symbol - Stock ticker symbol
   * @returns Promise<number> - Yesterday's opening price
   */
  private static async fetchFreshYesterdayPrice(symbol: string): Promise<number> {
    console.log(`Fetching fresh yesterday price for ${symbol} from AlphaVantage API...`);
    const response = await fetch(
      `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${process.env.ALPHAVANTAGE_API_KEY}&datatype=json&outputsize=compact`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data["Time Series (Daily)"]) {
      throw new Error(`No time series data found for ${symbol}`);
    }
    
    const timeSeries = data["Time Series (Daily)"];
    const dates = Object.keys(timeSeries).sort().reverse(); // Most recent first
    
    if (dates.length < 2) {
      throw new Error("Not enough data to get yesterday's price");
    }
    
    // Get the second most recent date (yesterday)
    const yesterday = dates[1];
    return parseFloat(timeSeries[yesterday]["1. open"]);
  }

  /**
   * Updates or inserts current price in cache
   * @param symbol - Stock ticker symbol
   * @param currentPrice - Current stock price
   */
  private static async updateCurrentPrice(symbol: string, currentPrice: number): Promise<void> {
    const db = await this.getDB();
    const timestamp = new Date().toISOString();
    
    // Check if record exists
    const existing = db.prepare(`SELECT ticker FROM prices WHERE ticker = ?`).get(symbol);
    
    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE prices 
        SET current_price = ?, last_updated = ?
        WHERE ticker = ?
      `).run(currentPrice, timestamp, symbol);
    } else {
      // Insert new record
      db.prepare(`
        INSERT INTO prices (ticker, current_price, last_updated)
        VALUES (?, ?, ?)
      `).run(symbol, currentPrice, timestamp);
    }
    
    console.log(`Cached fresh current price for ${symbol}: $${currentPrice}`);
  }

  /**
   * Updates or inserts yesterday's price in cache
   * @param symbol - Stock ticker symbol
   * @param yesterdayPrice - Yesterday's opening price
   */
  private static async updateYesterdayPrice(symbol: string, yesterdayPrice: number): Promise<void> {
    const db = await this.getDB();
    const timestamp = new Date().toISOString();
    
    // Check if record exists
    const existing = db.prepare(`SELECT ticker FROM prices WHERE ticker = ?`).get(symbol);
    
    if (existing) {
      // Update existing record
      db.prepare(`
        UPDATE prices 
        SET yesterday_price = ?, last_updated = ?
        WHERE ticker = ?
      `).run(yesterdayPrice, timestamp, symbol);
    } else {
      // Insert new record
      db.prepare(`
        INSERT INTO prices (ticker, yesterday_price, last_updated)
        VALUES (?, ?, ?)
      `).run(symbol, yesterdayPrice, timestamp);
    }
    
    console.log(`Cached fresh yesterday price for ${symbol}: $${yesterdayPrice}`);
  }

  /**
   * Gets both current and yesterday prices efficiently
   * @param symbol - Stock ticker symbol
   * @returns Promise<{current: number, yesterday: number}> - Both prices
   */
  static async getBothPrices(symbol: string): Promise<{current: number, yesterday: number}> {
    const [current, yesterday] = await Promise.all([
      this.getPriceFromSymbol(symbol),
      this.getYesterdayOpenPrice(symbol)
    ]);
    
    return { current, yesterday };
  }

  /**
   * Clears price cache for a specific symbol
   * @param symbol - Stock ticker symbol
   */
  static async clearCache(symbol: string): Promise<void> {
    const db = await this.getDB();
    db.prepare(`DELETE FROM prices WHERE ticker = ?`).run(symbol);
    console.log(`Cleared price cache for ${symbol}`);
  }

  /**
   * Gets price cache statistics
   * @returns Promise<{total: number, withYesterday: number}> - Cache statistics
   */
  static async getCacheStats(): Promise<{total: number, withYesterday: number}> {
    const db = await this.getDB();
    
    const total = db.prepare(`SELECT COUNT(*) as count FROM prices`).get().count;
    const withYesterday = db.prepare(`
      SELECT COUNT(*) as count FROM prices WHERE yesterday_price IS NOT NULL
    `).get().count;

    return { total, withYesterday };
  }
}