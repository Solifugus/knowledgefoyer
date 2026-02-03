/**
 * Logging Service for Knowledge Foyer
 *
 * Centralized, structured logging with multiple transports and error tracking
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

class LoggingService {
  constructor() {
    this.config = {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json', // json, text
      maxFileSize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
      enableConsole: process.env.NODE_ENV !== 'production' || process.env.LOG_CONSOLE === 'true',
      enableFile: process.env.LOG_FILE_PATH ? true : false,
      filePath: process.env.LOG_FILE_PATH || '/var/log/knowledge-foyer/app.log',
      errorFilePath: process.env.LOG_ERROR_FILE_PATH || '/var/log/knowledge-foyer/error.log'
    };

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      debug: 4
    };

    this.colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      http: '\x1b[35m',  // Magenta
      debug: '\x1b[37m', // White
      reset: '\x1b[0m'
    };

    this.logBuffer = [];
    this.errorBuffer = [];
    this.maxBufferSize = 1000;

    this.initializeLogDirectories();
    this.setupPeriodicFlush();
  }

  /**
   * Initialize log directories
   */
  initializeLogDirectories() {
    if (this.config.enableFile) {
      try {
        const logDir = path.dirname(this.config.filePath);
        const errorLogDir = path.dirname(this.config.errorFilePath);

        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        if (errorLogDir !== logDir && !fs.existsSync(errorLogDir)) {
          fs.mkdirSync(errorLogDir, { recursive: true });
        }
      } catch (error) {
        console.error('Failed to initialize log directories:', error.message);
        this.config.enableFile = false;
      }
    }
  }

  /**
   * Setup periodic buffer flush
   */
  setupPeriodicFlush() {
    // Flush buffers every 5 seconds
    setInterval(() => {
      this.flushBuffers();
    }, 5000);

    // Flush on process exit
    process.on('exit', () => this.flushBuffers());
    process.on('SIGINT', () => {
      this.flushBuffers();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.flushBuffers();
      process.exit(0);
    });
  }

  /**
   * Check if log level should be logged
   */
  shouldLog(level) {
    const configLevel = this.levels[this.config.level];
    const messageLevel = this.levels[level];
    return messageLevel <= configLevel;
  }

  /**
   * Format log entry
   */
  formatLogEntry(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;

    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      pid,
      message,
      ...meta
    };

    // Add request context if available
    if (meta.req) {
      logEntry.request = {
        id: meta.req.id,
        method: meta.req.method,
        url: meta.req.url,
        ip: meta.req.ip,
        userAgent: meta.req.get('User-Agent'),
        userId: meta.req.user?.id
      };
      delete logEntry.req;
    }

    // Add error details if present
    if (meta.error && meta.error instanceof Error) {
      logEntry.error = {
        name: meta.error.name,
        message: meta.error.message,
        stack: meta.error.stack,
        code: meta.error.code
      };
      delete logEntry.error;
    }

    return logEntry;
  }

  /**
   * Format log for console output
   */
  formatConsoleOutput(logEntry) {
    const { timestamp, level, message } = logEntry;
    const color = this.colors[level.toLowerCase()] || this.colors.reset;
    const reset = this.colors.reset;

    if (this.config.format === 'json') {
      return JSON.stringify(logEntry);
    }

    let output = `${color}[${timestamp}] ${level}:${reset} ${message}`;

    // Add context information
    if (logEntry.request) {
      output += ` [${logEntry.request.method} ${logEntry.request.url}]`;
    }

    if (logEntry.userId) {
      output += ` [User: ${logEntry.userId}]`;
    }

    if (logEntry.duration) {
      output += ` [${logEntry.duration}ms]`;
    }

    return output;
  }

  /**
   * Write log to console
   */
  writeToConsole(logEntry) {
    if (!this.config.enableConsole) return;

    const output = this.formatConsoleOutput(logEntry);

    if (logEntry.level === 'ERROR') {
      console.error(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Write log to file
   */
  writeToFile(logEntry) {
    if (!this.config.enableFile) return;

    const logLine = JSON.stringify(logEntry) + '\n';

    // Add to appropriate buffer
    if (logEntry.level === 'ERROR') {
      this.errorBuffer.push({
        file: this.config.errorFilePath,
        content: logLine
      });
    } else {
      this.logBuffer.push({
        file: this.config.filePath,
        content: logLine
      });
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize ||
        this.errorBuffer.length >= this.maxBufferSize) {
      this.flushBuffers();
    }
  }

  /**
   * Flush log buffers to files
   */
  flushBuffers() {
    try {
      // Flush regular logs
      if (this.logBuffer.length > 0) {
        const content = this.logBuffer.map(entry => entry.content).join('');
        fs.appendFileSync(this.config.filePath, content);
        this.logBuffer = [];
      }

      // Flush error logs
      if (this.errorBuffer.length > 0) {
        const content = this.errorBuffer.map(entry => entry.content).join('');
        fs.appendFileSync(this.config.errorFilePath, content);
        this.errorBuffer = [];
      }
    } catch (error) {
      console.error('Failed to flush log buffers:', error.message);
    }
  }

  /**
   * Core logging method
   */
  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const logEntry = this.formatLogEntry(level, message, meta);

    // Write to console
    this.writeToConsole(logEntry);

    // Write to file
    this.writeToFile(logEntry);

    // Send to monitoring service if available
    this.sendToMonitoring(logEntry);

    return logEntry;
  }

  /**
   * Send critical logs to monitoring service
   */
  sendToMonitoring(logEntry) {
    if (logEntry.level === 'ERROR') {
      try {
        const monitoringService = require('./MonitoringService');
        monitoringService.addAlert('application_error', logEntry.message, {
          ...logEntry,
          source: 'logging_service'
        });
      } catch (error) {
        // Monitoring service might not be available
      }
    }
  }

  /**
   * Convenience methods for different log levels
   */
  error(message, meta = {}) {
    return this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    return this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    return this.log('info', message, meta);
  }

  http(message, meta = {}) {
    return this.log('http', message, meta);
  }

  debug(message, meta = {}) {
    return this.log('debug', message, meta);
  }

  /**
   * Log database operations
   */
  database(operation, query, duration, error = null, meta = {}) {
    const level = error ? 'error' : duration > 1000 ? 'warn' : 'debug';
    const message = error ?
      `Database operation failed: ${operation}` :
      `Database operation: ${operation}`;

    this.log(level, message, {
      ...meta,
      operation,
      query: query.substring(0, 200),
      duration,
      error
    });
  }

  /**
   * Log API requests
   */
  request(req, res, duration) {
    const level = res.statusCode >= 400 ? 'warn' : 'http';
    const message = `${req.method} ${req.url} ${res.statusCode}`;

    this.log(level, message, {
      req,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length'),
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer')
    });
  }

  /**
   * Log authentication events
   */
  auth(event, userId, meta = {}) {
    this.log('info', `Authentication event: ${event}`, {
      ...meta,
      authEvent: event,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security events
   */
  security(event, details, meta = {}) {
    this.log('warn', `Security event: ${event}`, {
      ...meta,
      securityEvent: event,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log business events
   */
  business(event, data, meta = {}) {
    this.log('info', `Business event: ${event}`, {
      ...meta,
      businessEvent: event,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create child logger with context
   */
  child(context) {
    return {
      error: (message, meta = {}) => this.error(message, { ...context, ...meta }),
      warn: (message, meta = {}) => this.warn(message, { ...context, ...meta }),
      info: (message, meta = {}) => this.info(message, { ...context, ...meta }),
      http: (message, meta = {}) => this.http(message, { ...context, ...meta }),
      debug: (message, meta = {}) => this.debug(message, { ...context, ...meta }),
      database: (operation, query, duration, error, meta = {}) =>
        this.database(operation, query, duration, error, { ...context, ...meta }),
      request: (req, res, duration) => this.request(req, res, duration),
      auth: (event, userId, meta = {}) => this.auth(event, userId, { ...context, ...meta }),
      security: (event, details, meta = {}) => this.security(event, details, { ...context, ...meta }),
      business: (event, data, meta = {}) => this.business(event, data, { ...context, ...meta })
    };
  }

  /**
   * Get log statistics
   */
  getStats() {
    const stats = {
      config: this.config,
      buffers: {
        log: this.logBuffer.length,
        error: this.errorBuffer.length
      }
    };

    if (this.config.enableFile) {
      try {
        const logStats = fs.statSync(this.config.filePath);
        const errorStats = fs.statSync(this.config.errorFilePath);

        stats.files = {
          log: {
            size: logStats.size,
            modified: logStats.mtime
          },
          error: {
            size: errorStats.size,
            modified: errorStats.mtime
          }
        };
      } catch (error) {
        stats.files = { error: 'Could not read file stats' };
      }
    }

    return stats;
  }

  /**
   * Rotate log files
   */
  rotateLogs() {
    if (!this.config.enableFile) return;

    try {
      // Flush current buffers first
      this.flushBuffers();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Rotate main log file
      if (fs.existsSync(this.config.filePath)) {
        const rotatedPath = `${this.config.filePath}.${timestamp}`;
        fs.renameSync(this.config.filePath, rotatedPath);
      }

      // Rotate error log file
      if (fs.existsSync(this.config.errorFilePath)) {
        const rotatedPath = `${this.config.errorFilePath}.${timestamp}`;
        fs.renameSync(this.config.errorFilePath, rotatedPath);
      }

      this.info('Log files rotated successfully');
    } catch (error) {
      console.error('Failed to rotate log files:', error.message);
    }
  }

  /**
   * Clean up old log files
   */
  cleanupOldLogs() {
    if (!this.config.enableFile) return;

    try {
      const logDir = path.dirname(this.config.filePath);
      const errorLogDir = path.dirname(this.config.errorFilePath);

      // Clean up log directory
      this.cleanupDirectory(logDir, 'app.log');

      // Clean up error log directory if different
      if (errorLogDir !== logDir) {
        this.cleanupDirectory(errorLogDir, 'error.log');
      }

      this.info('Old log files cleaned up');
    } catch (error) {
      console.error('Failed to clean up old logs:', error.message);
    }
  }

  /**
   * Clean up files in directory
   */
  cleanupDirectory(directory, pattern) {
    const files = fs.readdirSync(directory)
      .filter(file => file.includes(pattern))
      .map(file => ({
        name: file,
        path: path.join(directory, file),
        stats: fs.statSync(path.join(directory, file))
      }))
      .sort((a, b) => b.stats.mtime - a.stats.mtime);

    // Keep only the configured number of files
    const filesToDelete = files.slice(this.config.maxFiles);

    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
    }
  }
}

// Create singleton instance
const loggingService = new LoggingService();

module.exports = loggingService;