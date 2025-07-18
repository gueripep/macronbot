import { queryAIBusinessOverview, queryAIRiskFactors, queryAIFullAnalysis } from "../ollama";

interface CachedAnalysis {
  businessOverview: string;
  riskFactorsOverview: string;
  aiAnalysis: string;
}

/**
 * Service for caching and retrieving AI analysis results for company 10-K filings
 * Prevents redundant AI calls for already analyzed companies
 */
export class AIAnalysisCacheService {
  
  /**
   * Gets the database connection instance
   * @returns Database connection object
   */
  private static async getDB() {
    return (await import("../../dbSetup")).default;
  }

  /**
   * Checks if cached analysis exists and is still valid (within 30 days)
   * @param ticker - Stock ticker symbol
   * @returns boolean - True if valid cache exists
   */
  private static isCacheValid(lastUpdated: string): boolean {
    const lastUpdateTime = new Date(lastUpdated);
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate < 30; // Cache valid for 30 days
  }

  /**
   * Retrieves cached AI analysis for a ticker if available and valid
   * @param ticker - Stock ticker symbol
   * @returns Promise<CachedAnalysis | null> - Cached analysis or null if not found/expired
   */
  static async getCachedAnalysis(ticker: string): Promise<CachedAnalysis | null> {
    const db = await this.getDB();
    
    const cached = db.prepare(`
      SELECT business_overview, risk_factors_overview, strengths_weaknesses, last_updated 
      FROM ai_analysis_cache 
      WHERE ticker = ?
    `).get(ticker);

    if (!cached) {
      console.log(`No cached analysis found for ${ticker}`);
      return null;
    }

    if (!this.isCacheValid(cached.last_updated)) {
      console.log(`Cached analysis for ${ticker} is expired (older than 30 days)`);
      return null;
    }

    console.log(`Using cached AI analysis for ${ticker}`);
    return {
      businessOverview: cached.business_overview,
      riskFactorsOverview: cached.risk_factors_overview,
      aiAnalysis: cached.strengths_weaknesses
    };
  }

  /**
   * Generates fresh AI analysis and caches the results
   * @param ticker - Stock ticker symbol
   * @param business10k - Business section from 10-K filing
   * @param riskFactors10k - Risk factors section from 10-K filing
   * @param mdna - MD&A section from 10-K filing
   * @returns Promise<CachedAnalysis> - Generated analysis results
   */
  static async generateAndCacheAnalysis(
    ticker: string, 
    business10k: string, 
    riskFactors10k: string, 
    mdna: string
  ): Promise<CachedAnalysis> {
    console.log(`Generating fresh AI analysis for ${ticker}...`);

    // Generate AI analyses sequentially to build context
    const businessOverview = await queryAIBusinessOverview(business10k);
    const riskFactorsOverview = await queryAIRiskFactors(riskFactors10k, businessOverview);
    const aiAnalysis = await queryAIFullAnalysis(mdna, businessOverview, riskFactorsOverview);

    // Cache the results
    await this.cacheAnalysis(ticker, businessOverview, riskFactorsOverview, aiAnalysis);

    console.log(`Generated and cached AI analysis for ${ticker}`);
    return {
      businessOverview,
      riskFactorsOverview,
      aiAnalysis
    };
  }

  /**
   * Stores AI analysis results in the database cache
   * @param ticker - Stock ticker symbol
   * @param businessOverview - AI-generated business overview
   * @param riskFactorsOverview - AI-generated risk factors analysis
   * @param strengthsWeaknesses - AI-generated strengths and weaknesses analysis
   */
  private static async cacheAnalysis(
    ticker: string,
    businessOverview: string,
    riskFactorsOverview: string,
    strengthsWeaknesses: string
  ): Promise<void> {
    const db = await this.getDB();
    const timestamp = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO ai_analysis_cache 
      (ticker, business_overview, risk_factors_overview, strengths_weaknesses, last_updated)
      VALUES (?, ?, ?, ?, ?)
    `).run(ticker, businessOverview, riskFactorsOverview, strengthsWeaknesses, timestamp);
  }

  /**
   * Gets or generates AI analysis for a company, using cache when available
   * @param ticker - Stock ticker symbol
   * @param business10k - Business section from 10-K filing
   * @param riskFactors10k - Risk factors section from 10-K filing
   * @param mdna - MD&A section from 10-K filing
   * @returns Promise<CachedAnalysis> - AI analysis results (cached or fresh)
   */
  static async getOrGenerateAnalysis(
    ticker: string,
    business10k: string,
    riskFactors10k: string,
    mdna: string
  ): Promise<CachedAnalysis> {
    // Try to get cached analysis first
    const cached = await this.getCachedAnalysis(ticker);
    if (cached) {
      return cached;
    }

    // Generate fresh analysis if no valid cache
    return await this.generateAndCacheAnalysis(ticker, business10k, riskFactors10k, mdna);
  }

  /**
   * Clears cached analysis for a specific ticker (useful for forcing refresh)
   * @param ticker - Stock ticker symbol
   */
  static async clearCache(ticker: string): Promise<void> {
    const db = await this.getDB();
    db.prepare(`DELETE FROM ai_analysis_cache WHERE ticker = ?`).run(ticker);
    console.log(`Cleared cached analysis for ${ticker}`);
  }

  /**
   * Gets cache statistics (useful for monitoring)
   * @returns Promise<{total: number, expired: number}> - Cache statistics
   */
  static async getCacheStats(): Promise<{total: number, expired: number}> {
    const db = await this.getDB();
    
    const total = db.prepare(`SELECT COUNT(*) as count FROM ai_analysis_cache`).get().count;
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const expired = db.prepare(`
      SELECT COUNT(*) as count FROM ai_analysis_cache 
      WHERE last_updated < ?
    `).get(thirtyDaysAgo.toISOString()).count;

    return { total, expired };
  }
}