import YahooFinance from 'yahoo-finance2';
import axios from 'axios';

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
  private yahooFinance: InstanceType<typeof YahooFinance>;
  private alphaVantageApiKey: string;
  private useAlphaVantage: boolean;

  constructor() {
    this.yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY ?? '9AVY0Z60WGSX4C1W';
    this.useAlphaVantage = !!this.alphaVantageApiKey;
  }

  /**
   * Get live quote for a single symbol using Alpha Vantage (primary) or Yahoo Finance (fallback)
   */
  async getQuote(symbol: string): Promise<QuoteData | null> {
    try {
      // Check cache first
      const cached = this.cache.get(symbol);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      // Fetching live quote - using console.warn for consistency
      console.warn(`Fetching live quote for ${symbol}`);

      // Try Alpha Vantage first if configured
      if (this.useAlphaVantage) {
        try {
          const alphaQuote = await this.getQuoteFromAlphaVantage(symbol);
          if (alphaQuote) {
            this.cache.set(symbol, { data: alphaQuote, timestamp: Date.now() });
            return alphaQuote;
          }
        } catch (alphaError) {
          console.warn(`Alpha Vantage failed for ${symbol}, trying fallback:`, alphaError);
        }
      }

      // Fallback to Yahoo Finance
      const result = await this.yahooFinance.quote(symbol);

      if (!result?.regularMarketPrice) {
        console.warn(`No price data available for ${symbol}`);
        return null;
      }

      const quoteData: QuoteData = {
        symbol: symbol.toUpperCase(),
        price: result.regularMarketPrice,
        change: result.regularMarketChange ?? 0,
        changePercent: result.regularMarketChangePercent ?? 0,
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
   * Get quote from Alpha Vantage API
   */
  private async getQuoteFromAlphaVantage(symbol: string): Promise<QuoteData | null> {
    try {
      // Alpha Vantage Global Quote endpoint
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol.toUpperCase(),
          apikey: this.alphaVantageApiKey,
        },
        timeout: 5000,
      });

      const data = response.data;

      // Check for API errors
      if (data['Error Message'] || data['Note']) {
        console.warn(
          `Alpha Vantage API error for ${symbol}:`,
          data['Error Message'] ?? data['Note']
        );
        return null;
      }

      const quote = data['Global Quote'];
      if (!quote?.['05. price']) {
        return null;
      }

      const price = parseFloat(quote['05. price']);
      const previousClose = parseFloat(quote['08. previous close']) ?? price;
      const change = price - previousClose;
      const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
      const volume = quote['06. volume'] ? parseInt(quote['06. volume']) : undefined;

      return {
        symbol: symbol.toUpperCase(),
        price,
        change,
        changePercent,
        volume,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error(`Alpha Vantage API error for ${symbol}:`, error);
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
      // Fetching live quotes - using console.warn for consistency
      console.warn(`Fetching live quotes for ${uncachedSymbols.length} symbols`);

      // Fetch quotes for each symbol individually
      const quotePromises = uncachedSymbols.map(async (symbol) => {
        try {
          // Try Alpha Vantage first if configured
          if (this.useAlphaVantage) {
            const alphaQuote = await this.getQuoteFromAlphaVantage(symbol);
            if (alphaQuote) {
              quotes.set(symbol.toUpperCase(), alphaQuote);
              this.cache.set(symbol.toUpperCase(), { data: alphaQuote, timestamp: Date.now() });
              return;
            }
          }

          // Fallback to Yahoo Finance
          const result = await this.yahooFinance.quote(symbol);
          if (result?.regularMarketPrice) {
            const quoteData: QuoteData = {
              symbol: symbol.toUpperCase(),
              price: result.regularMarketPrice,
              change: result.regularMarketChange ?? 0,
              changePercent: result.regularMarketChangePercent ?? 0,
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
  async searchSymbols(
    query: string
  ): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
    try {
      // Searching symbols - using console.warn for consistency
      console.warn(`Searching symbols for: ${query}`);
      const results = await this.yahooFinance.search(query);

      return (results as unknown as Array<{ symbol: string; shortName: string | null; longName: string | null; exchange: string | null }>).map((item) => ({
        symbol: item.symbol,
        name: item.shortName ?? item.longName ?? item.symbol,
        exchange: item.exchange ?? 'Unknown',
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
