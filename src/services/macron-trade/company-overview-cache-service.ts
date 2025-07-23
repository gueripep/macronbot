import { CompanyOverview } from "../../types.js";
import { PriceService } from "./price-service.js";

/**
 * Service for caching and retrieving company overview data from AlphaVantage
 * Prevents redundant API calls for recently fetched company data
 */
export class CompanyOverviewCacheService {
  
  /**
   * Gets the database connection instance
   * @returns Database connection object
   */
  private static async getDB() {
    return (await import("../../dbSetup")).default;
  }

  /**
   * Checks if cached company overview exists and is still valid (within 24 hours)
   * @param lastUpdated - ISO timestamp of last update
   * @returns boolean - True if valid cache exists
   */
  private static isCacheValid(lastUpdated: string): boolean {
    const lastUpdateTime = new Date(lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate < 24; // Cache valid for 24 hours
  }

  /**
   * Retrieves cached company overview for a ticker if available and valid
   * @param ticker - Stock ticker symbol
   * @returns Promise<CompanyOverview | null> - Cached overview or null if not found/expired
   */
  static async getCachedOverview(ticker: string): Promise<CompanyOverview | null> {
    const db = await this.getDB();
    
    const cached = db.prepare(`
      SELECT * FROM company_overview_cache WHERE ticker = ?
    `).get(ticker);

    if (!cached) {
      console.log(`No cached company overview found for ${ticker}`);
      return null;
    }

    if (!this.isCacheValid(cached.last_updated)) {
      console.log(`Cached company overview for ${ticker} is expired (older than 24 hours)`);
      return null;
    }

    console.log(`Using cached company overview for ${ticker}`);
    
    // Get fresh price information (prices change frequently)
    const priceInformation = await PriceService.getPriceFromSymbol(ticker);
    const yesterdayPrice = await PriceService.getYesterdayOpenPrice(ticker);
    const priceChange = ((priceInformation - yesterdayPrice) / yesterdayPrice) * 100;

    return {
      Symbol: cached.symbol,
      Name: cached.name,
      Sector: cached.sector,
      Industry: cached.industry,
      Description: cached.description,
      MarketCapitalization: cached.market_capitalization,
      RevenueTTM: cached.revenue_ttm,
      PERatio: cached.pe_ratio,
      ForwardPE: cached.forward_pe,
      DividendYield: cached.dividend_yield,
      DividendPerShare: cached.dividend_per_share,
      EPS: cached.eps,
      ProfitMargin: cached.profit_margin,
      OperatingMarginTTM: cached.operating_margin_ttm,
      PriceInformation: {
        Week52High: cached.week_52_high,
        Week52Low: cached.week_52_low,
        MovingAverage50Day: cached.moving_average_50_day,
        MovingAverage200Day: cached.moving_average_200_day,
        Beta: cached.beta,
        CurrentPrice: priceInformation,
        YesterdayPrice: yesterdayPrice,
      },
    };
  }

  /**
   * Stores company overview data in the database cache
   * @param ticker - Stock ticker symbol
   * @param overview - Company overview data to cache
   */
  static async cacheOverview(ticker: string, overview: CompanyOverview): Promise<void> {
    const db = await this.getDB();
    const timestamp = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO company_overview_cache 
      (ticker, symbol, name, sector, industry, description, market_capitalization, 
       revenue_ttm, pe_ratio, forward_pe, dividend_yield, dividend_per_share, eps, 
       profit_margin, operating_margin_ttm, week_52_high, week_52_low, 
       moving_average_50_day, moving_average_200_day, beta, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ticker,
      overview.Symbol,
      overview.Name,
      overview.Sector,
      overview.Industry,
      overview.Description,
      overview.MarketCapitalization,
      overview.RevenueTTM,
      overview.PERatio,
      overview.ForwardPE,
      overview.DividendYield,
      overview.DividendPerShare,
      overview.EPS,
      overview.ProfitMargin,
      overview.OperatingMarginTTM,
      overview.PriceInformation.Week52High,
      overview.PriceInformation.Week52Low,
      overview.PriceInformation.MovingAverage50Day,
      overview.PriceInformation.MovingAverage200Day,
      overview.PriceInformation.Beta,
      timestamp
    );

    console.log(`Cached company overview for ${ticker}`);
  }

  /**
   * Gets or fetches company overview, using cache when available
   * @param ticker - Stock ticker symbol
   * @param fetchFunction - Function to fetch fresh data if cache miss
   * @returns Promise<CompanyOverview> - Company overview (cached or fresh)
   */
  static async getOrFetchOverview(
    ticker: string,
    fetchFunction: () => Promise<CompanyOverview>
  ): Promise<CompanyOverview> {
    // Try to get cached overview first
    const cached = await this.getCachedOverview(ticker);
    if (cached) {
      return cached;
    }

    // Fetch fresh data if no valid cache
    console.log(`Fetching fresh company overview for ${ticker}...`);
    const freshOverview = await fetchFunction();
    
    // Cache the fresh data
    await this.cacheOverview(ticker, freshOverview);
    
    return freshOverview;
  }

  /**
   * Clears cached overview for a specific ticker
   * @param ticker - Stock ticker symbol
   */
  static async clearCache(ticker: string): Promise<void> {
    const db = await this.getDB();
    db.prepare(`DELETE FROM company_overview_cache WHERE ticker = ?`).run(ticker);
    console.log(`Cleared cached company overview for ${ticker}`);
  }

  /**
   * Gets cache statistics
   * @returns Promise<{total: number, expired: number}> - Cache statistics
   */
  static async getCacheStats(): Promise<{total: number, expired: number}> {
    const db = await this.getDB();
    
    const total = db.prepare(`SELECT COUNT(*) as count FROM company_overview_cache`).get().count;
    
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    
    const expired = db.prepare(`
      SELECT COUNT(*) as count FROM company_overview_cache 
      WHERE last_updated < ?
    `).get(twentyFourHoursAgo.toISOString()).count;

    return { total, expired };
  }
}