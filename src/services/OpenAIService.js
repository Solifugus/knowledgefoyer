/**
 * OpenAI Service for Knowledge Foyer
 *
 * Manages all OpenAI API interactions including embeddings generation,
 * feedback similarity detection, and automated feedback analysis
 */

const OpenAI = require('openai');
const { query } = require('../config/database');

class OpenAIService {
  constructor() {
    this.client = null;
    this.config = {
      apiKey: process.env.OPENAI_API_KEY,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      completionModel: process.env.OPENAI_COMPLETION_MODEL || 'gpt-4',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500,
      dailyBudget: parseFloat(process.env.OPENAI_DAILY_BUDGET) || 10.00,
      similarityThreshold: parseFloat(process.env.OPENAI_SIMILARITY_THRESHOLD) || 0.85,
      retryAttempts: 3,
      retryDelay: 1000
    };

    this.dailyUsage = {
      date: new Date().toISOString().split('T')[0],
      cost: 0,
      requests: 0,
      tokens: 0
    };

    this.isEnabled = false;
    this.lastError = null;

    this.initialize();
  }

  /**
   * Initialize OpenAI client
   */
  initialize() {
    try {
      if (!this.config.apiKey) {
        console.warn('🤖 OpenAI API key not provided. AI features will be disabled.');
        return;
      }

      this.client = new OpenAI({
        apiKey: this.config.apiKey
      });

      this.isEnabled = true;
      this.loadDailyUsage();
      console.log('🤖 OpenAI service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI service:', error.message);
      this.lastError = error;
      this.isEnabled = false;
    }
  }

  /**
   * Load daily usage from database
   */
  async loadDailyUsage() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await query(`
        SELECT cost, requests, tokens
        FROM openai_usage_tracking
        WHERE usage_date = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [today]);

      if (result.rows.length > 0) {
        this.dailyUsage = {
          date: today,
          cost: parseFloat(result.rows[0].cost),
          requests: parseInt(result.rows[0].requests),
          tokens: parseInt(result.rows[0].tokens)
        };
      } else {
        this.dailyUsage = { date: today, cost: 0, requests: 0, tokens: 0 };
      }
    } catch (error) {
      console.error('Error loading daily usage:', error.message);
      // Continue without usage tracking if DB error
    }
  }

  /**
   * Save usage to database
   */
  async saveUsage(cost, tokens, requestType) {
    try {
      this.dailyUsage.cost += cost;
      this.dailyUsage.requests += 1;
      this.dailyUsage.tokens += tokens;

      await query(`
        INSERT INTO openai_usage_tracking (
          usage_date, cost, requests, tokens, request_type, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        this.dailyUsage.date,
        this.dailyUsage.cost,
        this.dailyUsage.requests,
        this.dailyUsage.tokens,
        requestType
      ]);
    } catch (error) {
      console.error('Error saving usage:', error.message);
    }
  }

  /**
   * Check if within budget limits
   */
  checkBudget() {
    if (this.dailyUsage.cost >= this.config.dailyBudget) {
      console.warn(`🤖 Daily OpenAI budget exceeded: $${this.dailyUsage.cost.toFixed(4)} / $${this.config.dailyBudget}`);
      return false;
    }

    if (this.dailyUsage.cost >= this.config.dailyBudget * 0.8) {
      console.warn(`🤖 OpenAI budget warning: $${this.dailyUsage.cost.toFixed(4)} / $${this.config.dailyBudget} (80%)`);
    }

    return true;
  }

  /**
   * Estimate cost for embedding request
   */
  estimateEmbeddingCost(text) {
    // text-embedding-3-small pricing: $0.00002 per 1K tokens
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(text.length / 4);
    const cost = (estimatedTokens / 1000) * 0.00002;
    return { estimatedTokens, cost };
  }

  /**
   * Estimate cost for completion request
   */
  estimateCompletionCost(inputText, outputTokens = null) {
    // gpt-4 pricing: $0.03 per 1K input tokens, $0.06 per 1K output tokens
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokensEst = outputTokens || this.config.maxTokens;

    const inputCost = (inputTokens / 1000) * 0.03;
    const outputCost = (outputTokensEst / 1000) * 0.06;

    return {
      inputTokens,
      outputTokens: outputTokensEst,
      cost: inputCost + outputCost
    };
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text, retryCount = 0) {
    if (!this.isEnabled || !this.checkBudget()) {
      throw new Error('OpenAI service not available or budget exceeded');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty for embedding generation');
    }

    try {
      const { estimatedTokens, cost } = this.estimateEmbeddingCost(text);

      console.log(`🤖 Generating embedding for ${estimatedTokens} tokens (est. $${cost.toFixed(6)})`);

      const response = await this.client.embeddings.create({
        model: this.config.embeddingModel,
        input: text.trim(),
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      const actualTokens = response.usage.total_tokens;
      const actualCost = (actualTokens / 1000) * 0.00002;

      await this.saveUsage(actualCost, actualTokens, 'embedding');

      console.log(`🤖 Embedding generated: ${actualTokens} tokens, $${actualCost.toFixed(6)}`);

      return {
        embedding,
        tokens: actualTokens,
        cost: actualCost,
        model: this.config.embeddingModel
      };
    } catch (error) {
      console.error('OpenAI embedding error:', error.message);

      // Retry logic
      if (retryCount < this.config.retryAttempts && this.isRetryableError(error)) {
        console.log(`🤖 Retrying embedding generation (attempt ${retryCount + 1}/${this.config.retryAttempts})`);
        await this.sleep(this.config.retryDelay * (retryCount + 1));
        return this.generateEmbedding(text, retryCount + 1);
      }

      // Handle specific error types
      if (error.code === 'insufficient_quota' || error.message.includes('quota')) {
        this.isEnabled = false;
        throw new Error('OpenAI quota exceeded. AI features temporarily disabled.');
      }

      if (error.code === 'rate_limit_exceeded') {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }

      throw error;
    }
  }

  /**
   * Generate completion for feedback analysis
   */
  async generateCompletion(prompt, systemPrompt = null, retryCount = 0) {
    if (!this.isEnabled || !this.checkBudget()) {
      throw new Error('OpenAI service not available or budget exceeded');
    }

    try {
      const { cost } = this.estimateCompletionCost(prompt + (systemPrompt || ''));

      console.log(`🤖 Generating completion (est. $${cost.toFixed(4)})`);

      const messages = [];

      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }

      messages.push({ role: 'user', content: prompt });

      const response = await this.client.chat.completions.create({
        model: this.config.completionModel,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: 0.3, // Lower temperature for more consistent analysis
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      });

      const completion = response.choices[0].message.content;
      const inputTokens = response.usage.prompt_tokens;
      const outputTokens = response.usage.completion_tokens;
      const totalTokens = response.usage.total_tokens;

      // Calculate actual cost
      const inputCost = (inputTokens / 1000) * 0.03;
      const outputCost = (outputTokens / 1000) * 0.06;
      const actualCost = inputCost + outputCost;

      await this.saveUsage(actualCost, totalTokens, 'completion');

      console.log(`🤖 Completion generated: ${totalTokens} tokens (${inputTokens}+${outputTokens}), $${actualCost.toFixed(4)}`);

      return {
        content: completion,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        },
        cost: actualCost,
        model: this.config.completionModel
      };
    } catch (error) {
      console.error('OpenAI completion error:', error.message);

      // Retry logic
      if (retryCount < this.config.retryAttempts && this.isRetryableError(error)) {
        console.log(`🤖 Retrying completion generation (attempt ${retryCount + 1}/${this.config.retryAttempts})`);
        await this.sleep(this.config.retryDelay * (retryCount + 1));
        return this.generateCompletion(prompt, systemPrompt, retryCount + 1);
      }

      // Handle specific error types
      if (error.code === 'insufficient_quota' || error.message.includes('quota')) {
        this.isEnabled = false;
        throw new Error('OpenAI quota exceeded. AI features temporarily disabled.');
      }

      if (error.code === 'rate_limit_exceeded') {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'rate_limit_exceeded',
      'server_error',
      'timeout',
      'connection_error',
      'service_unavailable'
    ];

    return retryableErrors.some(errorType =>
      error.code === errorType ||
      error.message.toLowerCase().includes(errorType.replace('_', ' '))
    );
  }

  /**
   * Sleep utility for retries
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must be of equal length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Get current usage statistics
   */
  getUsageStats() {
    return {
      ...this.dailyUsage,
      budgetLimit: this.config.dailyBudget,
      budgetUsed: (this.dailyUsage.cost / this.config.dailyBudget * 100).toFixed(1),
      isEnabled: this.isEnabled,
      lastError: this.lastError?.message || null,
      models: {
        embedding: this.config.embeddingModel,
        completion: this.config.completionModel
      }
    };
  }

  /**
   * Reset daily usage (for testing or manual reset)
   */
  resetDailyUsage() {
    this.dailyUsage = {
      date: new Date().toISOString().split('T')[0],
      cost: 0,
      requests: 0,
      tokens: 0
    };
  }

  /**
   * Enable/disable service manually
   */
  setEnabled(enabled) {
    if (enabled && !this.config.apiKey) {
      throw new Error('Cannot enable OpenAI service without API key');
    }

    this.isEnabled = enabled;
    console.log(`🤖 OpenAI service ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const testText = "This is a test.";
      const result = await this.generateEmbedding(testText);
      return {
        success: true,
        message: 'OpenAI API connection successful',
        model: result.model,
        tokens: result.tokens,
        cost: result.cost
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.code || 'unknown'
      };
    }
  }
}

// Create singleton instance
const openAIService = new OpenAIService();

module.exports = openAIService;