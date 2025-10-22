import YahooFinance from 'yahoo-finance2';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  lastUpdated: Date;
}

export class QuotesService {
  private cache: Map<string, { data: QuoteData; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute cache
  private yahooFinance: YahooFinance;

  constructor() {
    this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }

  /**
   * Get live quote for a single symbol
   */
  async getQuote(symbol: string): Promise<QuoteData | null> {
    try {
      // Check cache first
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      console.log(`Fetching live quote for ${symbol}`);
      const result = await this.yahooFinance.quote(symbol);
      
      if (!result || !result.regularMarketPrice) {
        console.warn(`No price data available for ${symbol}`);
        return null;
      }

      const quoteData: QuoteData = {
        symbol: symbol.toUpperCase(),
        price: result.regularMarketPrice,
        change: result.regularMarketChange || 0,
        changePercent: result.regularMarketChangePercent || 0,
        volume: result.regularMarketVolume,
        marketCap: result.marketCap,
        lastUpdated: new Date(),
      };

      // Cache the result
      this.cache.set(symbol, { data: quoteData, timestamp: Date.now() });
      
      return quoteData;
    } catch (error) {
      console.error(`Error fetching quote for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get live quotes for multiple symbols
   */
  async getQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
    const quotes = new Map<string, QuoteData>();
    
    // Check cache for all symbols first
    const uncachedSymbols: string[] = [];
    for (const symbol of symbols) {
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        quotes.set(symbol, cached.data);
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    if (uncachedSymbols.length === 0) {
      return quotes;
    }

    try {
      console.log(`Fetching live quotes for ${uncachedSymbols.length} symbols`);
      
      // Fetch quotes for each symbol individually
      const quotePromises = uncachedSymbols.map(async (symbol) => {
        try {
          const result = await this.yahooFinance.quote(symbol);
          if (result && result.regularMarketPrice) {
            const quoteData: QuoteData = {
              symbol: symbol.toUpperCase(),
              price: result.regularMarketPrice,
              change: result.regularMarketChange || 0,
              changePercent: result.regularMarketChangePercent || 0,
              volume: result.regularMarketVolume,
              marketCap: result.marketCap,
              lastUpdated: new Date(),
            };
            
            quotes.set(symbol.toUpperCase(), quoteData);
            this.cache.set(symbol.toUpperCase(), { data: quoteData, timestamp: Date.now() });
          }
        } catch (error) {
          console.error(`Error fetching quote for ${symbol}:`, error);
        }
      });
      
      await Promise.all(quotePromises);
    } catch (error) {
      console.error('Error fetching multiple quotes:', error);
    }

    return quotes;
  }

  /**
   * Search for symbols by name
   */
  async searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
    try {
      console.log(`Searching symbols for: ${query}`);
      const results = await this.yahooFinance.search(query);
      
      return results.map(item => ({
        symbol: item.symbol,
        name: item.shortName || item.longName || item.symbol,
        exchange: item.exchange || 'Unknown',
      }));
    } catch (error) {
      console.error(`Error searching symbols for ${query}:`, error);
      return [];
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; symbols: string[] } {
    return {
      size: this.cache.size,
      symbols: Array.from(this.cache.keys()),
    };
  }
}

export const quotesService = new QuotesService();
