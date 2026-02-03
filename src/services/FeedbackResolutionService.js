/**
 * Feedback Resolution Service for Knowledge Foyer
 *
 * AI-powered analysis of whether feedback has been addressed in article updates
 */

const { query, transaction } = require('../config/database');
const openAIService = require('./OpenAIService');
const crypto = require('crypto');

class FeedbackResolutionService {
  constructor() {
    this.confidenceThreshold = 0.8; // High confidence required for automatic marking
    this.batchSize = 10; // Analyze feedback in batches
  }

  /**
   * Analyze feedback resolution when article is updated
   */
  async analyzeArticleUpdate(articleId, oldContent, newContent, changeSummary = null) {
    if (!openAIService.isEnabled) {
      console.log('🤖 OpenAI service not available for feedback resolution analysis');
      return {
        analyzed: false,
        reason: 'AI service not available',
        feedback_analyzed: 0,
        resolutions: []
      };
    }

    try {
      console.log(`🔍 Analyzing feedback resolution for article ${articleId}`);

      // Get active feedback for this article
      const feedbackResult = await query(`
        SELECT f.id, f.content, f.user_id, f.created_at, u.username
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE f.article_id = $1
          AND f.status = 'active'
        ORDER BY f.created_at DESC
        LIMIT 50
      `, [articleId]);

      const feedbackItems = feedbackResult.rows;

      if (feedbackItems.length === 0) {
        return {
          analyzed: true,
          reason: 'No active feedback to analyze',
          feedback_analyzed: 0,
          resolutions: []
        };
      }

      const resolutions = [];
      let analyzedCount = 0;

      // Calculate content hashes for tracking
      const oldContentHash = this.generateContentHash(oldContent);
      const newContentHash = this.generateContentHash(newContent);

      // Process feedback in batches to manage API costs
      for (let i = 0; i < feedbackItems.length; i += this.batchSize) {
        const batch = feedbackItems.slice(i, i + this.batchSize);

        for (const feedback of batch) {
          try {
            const analysis = await this.analyzeSingleFeedback(
              feedback,
              oldContent,
              newContent,
              changeSummary
            );

            if (analysis) {
              // Store analysis result
              await this.storeResolutionAnalysis({
                feedbackId: feedback.id,
                articleVersion: await this.getArticleVersion(articleId),
                addressed: analysis.addressed,
                confidence: analysis.confidence,
                explanation: analysis.explanation,
                oldContentHash,
                newContentHash,
                analysisModel: openAIService.config.completionModel
              });

              resolutions.push({
                feedback_id: feedback.id,
                feedback_content: feedback.content,
                addressed: analysis.addressed,
                confidence: analysis.confidence,
                explanation: analysis.explanation,
                auto_marked: analysis.addressed && analysis.confidence >= this.confidenceThreshold
              });

              // Automatically mark as addressed if high confidence
              if (analysis.addressed && analysis.confidence >= this.confidenceThreshold) {
                await this.markFeedbackAddressed(feedback.id, analysis);
              }

              analyzedCount++;
            }
          } catch (feedbackError) {
            console.error(`Error analyzing feedback ${feedback.id}:`, feedbackError.message);
            continue;
          }
        }

        // Add delay between batches to respect rate limits
        if (i + this.batchSize < feedbackItems.length) {
          await this.sleep(1000);
        }
      }

      console.log(`🔍 Feedback resolution analysis complete: ${analyzedCount} items analyzed`);

      return {
        analyzed: true,
        reason: 'Analysis completed',
        feedback_analyzed: analyzedCount,
        resolutions,
        content_hashes: {
          old: oldContentHash,
          new: newContentHash
        }
      };
    } catch (error) {
      console.error('Error in feedback resolution analysis:', error.message);
      return {
        analyzed: false,
        reason: error.message,
        feedback_analyzed: 0,
        resolutions: []
      };
    }
  }

  /**
   * Analyze single feedback item against article changes
   */
  async analyzeSingleFeedback(feedback, oldContent, newContent, changeSummary) {
    try {
      const analysisPrompt = this.buildAnalysisPrompt(
        feedback.content,
        oldContent,
        newContent,
        changeSummary
      );

      const systemPrompt = `You are an expert at analyzing whether feedback has been addressed in article revisions.

Your task is to determine if specific feedback has been resolved by comparing the old and new versions of an article.

Return your analysis in JSON format:
{
  "addressed": boolean,
  "confidence": number (0.0 to 1.0),
  "explanation": "Brief explanation of your reasoning"
}

Guidelines:
- Only mark as "addressed" if the feedback concern has been clearly resolved
- Use high confidence (>0.8) only when you're very certain
- Consider both direct changes and indirect improvements
- Be conservative - false positives are worse than false negatives`;

      const completionResult = await openAIService.generateCompletion(analysisPrompt, systemPrompt);

      // Parse JSON response
      try {
        const analysis = JSON.parse(completionResult.content);

        // Validate response structure
        if (typeof analysis.addressed !== 'boolean' ||
            typeof analysis.confidence !== 'number' ||
            typeof analysis.explanation !== 'string') {
          throw new Error('Invalid response structure');
        }

        // Validate confidence range
        if (analysis.confidence < 0 || analysis.confidence > 1) {
          analysis.confidence = Math.max(0, Math.min(1, analysis.confidence));
        }

        return analysis;
      } catch (parseError) {
        console.error('Error parsing AI analysis response:', parseError.message);
        console.error('Raw response:', completionResult.content);

        // Try to extract basic information from non-JSON response
        const content = completionResult.content.toLowerCase();
        const addressed = content.includes('addressed') || content.includes('resolved') || content.includes('fixed');
        const confidence = addressed ? 0.3 : 0.1; // Low confidence for fallback parsing

        return {
          addressed,
          confidence,
          explanation: 'Automated analysis with limited confidence due to parsing issues'
        };
      }
    } catch (error) {
      console.error('Error in single feedback analysis:', error.message);
      return null;
    }
  }

  /**
   * Build analysis prompt for GPT-4
   */
  buildAnalysisPrompt(feedbackContent, oldContent, newContent, changeSummary) {
    // Truncate content if too long to manage API costs
    const maxContentLength = 3000;
    const truncatedOldContent = oldContent.length > maxContentLength
      ? oldContent.substring(0, maxContentLength) + '... [truncated]'
      : oldContent;

    const truncatedNewContent = newContent.length > maxContentLength
      ? newContent.substring(0, maxContentLength) + '... [truncated]'
      : newContent;

    let prompt = `
Analyze whether the following feedback has been addressed in this article revision:

FEEDBACK TO ANALYZE:
"${feedbackContent}"

ORIGINAL ARTICLE VERSION:
${truncatedOldContent}

UPDATED ARTICLE VERSION:
${truncatedNewContent}
    `.trim();

    if (changeSummary) {
      prompt += `\n\nAUTHOR'S CHANGE SUMMARY:\n"${changeSummary}"`;
    }

    prompt += `\n\nPlease analyze whether the feedback concern has been addressed and provide your assessment in the specified JSON format.`;

    return prompt;
  }

  /**
   * Store resolution analysis in database
   */
  async storeResolutionAnalysis(analysisData) {
    try {
      await query(`
        INSERT INTO feedback_resolution_analysis (
          feedback_id, article_version, addressed, confidence_score,
          explanation, old_content_hash, new_content_hash, analysis_model
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        analysisData.feedbackId,
        analysisData.articleVersion,
        analysisData.addressed,
        analysisData.confidence,
        analysisData.explanation,
        analysisData.oldContentHash,
        analysisData.newContentHash,
        analysisData.analysisModel
      ]);

      return true;
    } catch (error) {
      console.error('Error storing resolution analysis:', error.message);
      return false;
    }
  }

  /**
   * Mark feedback as addressed with AI confidence
   */
  async markFeedbackAddressed(feedbackId, analysis) {
    try {
      await query(`
        UPDATE feedback
        SET status = 'addressed', updated_at = NOW()
        WHERE id = $1
      `, [feedbackId]);

      // Also update feedback_resolution table if exists
      try {
        await query(`
          UPDATE feedback_resolution
          SET ai_analyzed = true,
              ai_confidence = $2,
              ai_explanation = $3,
              updated_at = NOW()
          WHERE feedback_id = $1
        `, [feedbackId, analysis.confidence, analysis.explanation]);
      } catch (resolutionError) {
        // This might fail if no resolution record exists, which is fine
        console.log(`No resolution record to update for feedback ${feedbackId}`);
      }

      console.log(`✅ Feedback ${feedbackId} automatically marked as addressed (confidence: ${analysis.confidence})`);
      return true;
    } catch (error) {
      console.error(`Error marking feedback ${feedbackId} as addressed:`, error.message);
      return false;
    }
  }

  /**
   * Get article version number
   */
  async getArticleVersion(articleId) {
    try {
      const result = await query(
        'SELECT version FROM articles WHERE id = $1',
        [articleId]
      );
      return result.rows.length > 0 ? result.rows[0].version : 1;
    } catch (error) {
      console.error('Error getting article version:', error.message);
      return 1;
    }
  }

  /**
   * Generate content hash for tracking changes
   */
  generateContentHash(content) {
    return crypto.createHash('sha256').update(content || '').digest('hex');
  }

  /**
   * Get resolution analysis history for feedback
   */
  async getResolutionHistory(feedbackId) {
    const result = await query(`
      SELECT *
      FROM feedback_resolution_analysis
      WHERE feedback_id = $1
      ORDER BY created_at DESC
    `, [feedbackId]);

    return result.rows.map(row => ({
      id: row.id,
      article_version: row.article_version,
      addressed: row.addressed,
      confidence_score: parseFloat(row.confidence_score),
      explanation: row.explanation,
      analysis_model: row.analysis_model,
      created_at: row.created_at
    }));
  }

  /**
   * Get resolution statistics for an article
   */
  async getArticleResolutionStats(articleId) {
    const result = await query(`
      SELECT
        COUNT(f.*) as total_feedback,
        COUNT(CASE WHEN f.status = 'addressed' THEN 1 END) as addressed_feedback,
        COUNT(fra.*) as ai_analyzed_feedback,
        COUNT(CASE WHEN fra.addressed = true THEN 1 END) as ai_detected_addressed,
        AVG(CASE WHEN fra.confidence_score IS NOT NULL THEN fra.confidence_score END) as avg_confidence,
        MAX(fra.created_at) as last_analysis_at
      FROM feedback f
      LEFT JOIN feedback_resolution_analysis fra ON f.id = fra.feedback_id
      WHERE f.article_id = $1
    `, [articleId]);

    const stats = result.rows[0];

    return {
      total_feedback: parseInt(stats.total_feedback),
      addressed_feedback: parseInt(stats.addressed_feedback),
      ai_analyzed_feedback: parseInt(stats.ai_analyzed_feedback),
      ai_detected_addressed: parseInt(stats.ai_detected_addressed),
      avg_confidence: stats.avg_confidence ? parseFloat(stats.avg_confidence) : null,
      last_analysis_at: stats.last_analysis_at,
      resolution_rate: stats.total_feedback > 0
        ? (parseInt(stats.addressed_feedback) / parseInt(stats.total_feedback) * 100).toFixed(1)
        : '0.0'
    };
  }

  /**
   * Manually trigger analysis for specific feedback
   */
  async analyzeSpecificFeedback(feedbackId, oldContent, newContent, changeSummary = null) {
    if (!openAIService.isEnabled) {
      throw new Error('AI service not available');
    }

    try {
      // Get feedback details
      const feedbackResult = await query(`
        SELECT f.*, a.id as article_id
        FROM feedback f
        JOIN articles a ON f.article_id = a.id
        WHERE f.id = $1
      `, [feedbackId]);

      if (feedbackResult.rows.length === 0) {
        throw new Error('Feedback not found');
      }

      const feedback = feedbackResult.rows[0];

      const analysis = await this.analyzeSingleFeedback(
        feedback,
        oldContent,
        newContent,
        changeSummary
      );

      if (!analysis) {
        throw new Error('Analysis failed');
      }

      // Store the analysis
      await this.storeResolutionAnalysis({
        feedbackId: feedbackId,
        articleVersion: await this.getArticleVersion(feedback.article_id),
        addressed: analysis.addressed,
        confidence: analysis.confidence,
        explanation: analysis.explanation,
        oldContentHash: this.generateContentHash(oldContent),
        newContentHash: this.generateContentHash(newContent),
        analysisModel: openAIService.config.completionModel
      });

      return analysis;
    } catch (error) {
      console.error('Error in manual feedback analysis:', error.message);
      throw error;
    }
  }

  /**
   * Sleep utility for rate limiting
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set confidence threshold for automatic marking
   */
  setConfidenceThreshold(threshold) {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }

    this.confidenceThreshold = threshold;
    console.log(`🤖 Feedback resolution confidence threshold set to ${threshold}`);
  }

  /**
   * Get global resolution statistics
   */
  async getGlobalResolutionStats() {
    try {
      const result = await query(`
        SELECT
          COUNT(DISTINCT f.id) as total_feedback,
          COUNT(DISTINCT CASE WHEN f.status = 'addressed' THEN f.id END) as addressed_feedback,
          COUNT(DISTINCT fra.feedback_id) as ai_analyzed,
          COUNT(CASE WHEN fra.addressed = true AND fra.confidence_score >= $1 THEN 1 END) as high_confidence_addressed,
          AVG(fra.confidence_score) as avg_confidence_score,
          COUNT(DISTINCT fra.analysis_model) as models_used
        FROM feedback f
        LEFT JOIN feedback_resolution_analysis fra ON f.id = fra.feedback_id
        WHERE f.status = 'active' OR f.status = 'addressed'
      `, [this.confidenceThreshold]);

      return {
        ...result.rows[0],
        confidence_threshold: this.confidenceThreshold,
        total_feedback: parseInt(result.rows[0].total_feedback),
        addressed_feedback: parseInt(result.rows[0].addressed_feedback),
        ai_analyzed: parseInt(result.rows[0].ai_analyzed),
        high_confidence_addressed: parseInt(result.rows[0].high_confidence_addressed),
        avg_confidence_score: result.rows[0].avg_confidence_score ? parseFloat(result.rows[0].avg_confidence_score) : null,
        models_used: parseInt(result.rows[0].models_used)
      };
    } catch (error) {
      console.error('Error getting global resolution statistics:', error.message);
      throw error;
    }
  }
}

// Create singleton instance
const feedbackResolutionService = new FeedbackResolutionService();

module.exports = feedbackResolutionService;