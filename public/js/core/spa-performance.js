/**
 * Knowledge Foyer - Performance Monitoring and Optimization
 * Step 10: Advanced performance tracking, optimization, and user experience monitoring
 */

class SPAPerformance {
    constructor(manager) {
        this.manager = manager;
        this.metrics = new Map();
        this.observations = [];
        this.performanceData = {
            navigation: [],
            resources: [],
            marks: [],
            measures: [],
            vitals: {}
        };

        this.thresholds = {
            FCP: 1800,  // First Contentful Paint (ms)
            LCP: 2500,  // Largest Contentful Paint (ms)
            FID: 100,   // First Input Delay (ms)
            CLS: 0.1,   // Cumulative Layout Shift
            TTFB: 600   // Time to First Byte (ms)
        };

        this.initializePerformanceMonitoring();
    }

    /**
     * Initialize performance monitoring system
     */
    initializePerformanceMonitoring() {
        this.setupPerformanceObserver();
        this.setupWebVitalsMonitoring();
        this.setupCustomMetrics();
        this.setupResourceMonitoring();
        this.setupUserExperienceMetrics();
        this.setupPerformanceReporting();

        console.log('📊 Performance monitoring initialized');
    }

    /**
     * Set up Performance Observer API
     */
    setupPerformanceObserver() {
        if (!('PerformanceObserver' in window)) {
            console.warn('PerformanceObserver not supported');
            return;
        }

        // Navigation timing
        this.observeNavigationTiming();

        // Resource timing
        this.observeResourceTiming();

        // Paint timing
        this.observePaintTiming();

        // Layout shift
        this.observeLayoutShift();

        // Long tasks
        this.observeLongTasks();
    }

    /**
     * Observe navigation timing
     */
    observeNavigationTiming() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.recordNavigationMetrics(entry);
                }
            });
            observer.observe({ entryTypes: ['navigation'] });
        } catch (error) {
            console.warn('Navigation timing observation failed:', error);
        }
    }

    /**
     * Observe resource timing
     */
    observeResourceTiming() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.recordResourceMetrics(entry);
                }
            });
            observer.observe({ entryTypes: ['resource'] });
        } catch (error) {
            console.warn('Resource timing observation failed:', error);
        }
    }

    /**
     * Observe paint timing
     */
    observePaintTiming() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.recordPaintMetrics(entry);
                }
            });
            observer.observe({ entryTypes: ['paint'] });
        } catch (error) {
            console.warn('Paint timing observation failed:', error);
        }
    }

    /**
     * Observe layout shift
     */
    observeLayoutShift() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.recordLayoutShift(entry);
                }
            });
            observer.observe({ entryTypes: ['layout-shift'] });
        } catch (error) {
            console.warn('Layout shift observation failed:', error);
        }
    }

    /**
     * Observe long tasks
     */
    observeLongTasks() {
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.recordLongTask(entry);
                }
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) {
            console.warn('Long task observation failed:', error);
        }
    }

    /**
     * Set up Web Vitals monitoring
     */
    setupWebVitalsMonitoring() {
        // First Contentful Paint
        this.measureFCP();

        // Largest Contentful Paint
        this.measureLCP();

        // First Input Delay
        this.measureFID();

        // Cumulative Layout Shift
        this.measureCLS();
    }

    /**
     * Measure First Contentful Paint
     */
    measureFCP() {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name === 'first-contentful-paint') {
                    this.recordVital('FCP', entry.startTime);
                    observer.disconnect();
                }
            }
        });
        observer.observe({ entryTypes: ['paint'] });
    }

    /**
     * Measure Largest Contentful Paint
     */
    measureLCP() {
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            this.recordVital('LCP', lastEntry.startTime);
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
    }

    /**
     * Measure First Input Delay
     */
    measureFID() {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this.recordVital('FID', entry.processingStart - entry.startTime);
                observer.disconnect();
            }
        });
        observer.observe({ entryTypes: ['first-input'] });
    }

    /**
     * Measure Cumulative Layout Shift
     */
    measureCLS() {
        let clsValue = 0;
        let clsEntries = [];

        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                    clsValue += entry.value;
                    clsEntries.push(entry);
                }
            }
            this.recordVital('CLS', clsValue);
        });
        observer.observe({ entryTypes: ['layout-shift'] });
    }

    /**
     * Set up custom SPA metrics
     */
    setupCustomMetrics() {
        // Route change performance
        document.addEventListener('spa:route-changed', (event) => {
            this.measureRouteChange(event.detail);
        });

        // Component render time
        this.setupComponentMetrics();

        // User interaction metrics
        this.setupInteractionMetrics();
    }

    /**
     * Measure route change performance
     */
    measureRouteChange(routeInfo) {
        const mark = `route-change-${routeInfo.route}-${Date.now()}`;
        performance.mark(`${mark}-start`);

        // Measure when route is fully loaded
        requestAnimationFrame(() => {
            setTimeout(() => {
                performance.mark(`${mark}-end`);
                performance.measure(`route-change-${routeInfo.route}`, `${mark}-start`, `${mark}-end`);

                const measure = performance.getEntriesByName(`route-change-${routeInfo.route}`).pop();
                this.recordCustomMetric('route-change', {
                    route: routeInfo.route,
                    duration: measure.duration,
                    timestamp: Date.now()
                });
            }, 100);
        });
    }

    /**
     * Set up component metrics
     */
    setupComponentMetrics() {
        // Track component render times
        this.trackComponentRender = (componentName, renderFunction) => {
            const mark = `${componentName}-render-${Date.now()}`;
            performance.mark(`${mark}-start`);

            const result = renderFunction();

            performance.mark(`${mark}-end`);
            performance.measure(`${componentName}-render`, `${mark}-start`, `${mark}-end`);

            const measure = performance.getEntriesByName(`${componentName}-render`).pop();
            this.recordCustomMetric('component-render', {
                component: componentName,
                duration: measure.duration,
                timestamp: Date.now()
            });

            return result;
        };
    }

    /**
     * Set up interaction metrics
     */
    setupInteractionMetrics() {
        // Track click responsiveness
        document.addEventListener('click', (event) => {
            const startTime = performance.now();
            requestAnimationFrame(() => {
                const endTime = performance.now();
                this.recordCustomMetric('click-responsiveness', {
                    target: event.target.tagName.toLowerCase(),
                    duration: endTime - startTime,
                    timestamp: Date.now()
                });
            });
        });

        // Track scroll performance
        let scrollStartTime = null;
        document.addEventListener('scroll', () => {
            if (scrollStartTime === null) {
                scrollStartTime = performance.now();
                requestAnimationFrame(() => {
                    const endTime = performance.now();
                    this.recordCustomMetric('scroll-performance', {
                        duration: endTime - scrollStartTime,
                        timestamp: Date.now()
                    });
                    scrollStartTime = null;
                });
            }
        });
    }

    /**
     * Set up resource monitoring
     */
    setupResourceMonitoring() {
        // Monitor bundle sizes
        this.monitorBundleSizes();

        // Monitor cache hit rates
        this.monitorCachePerformance();

        // Monitor network conditions
        this.monitorNetworkConditions();
    }

    /**
     * Monitor bundle sizes
     */
    monitorBundleSizes() {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.name.includes('.js') || entry.name.includes('.css')) {
                    this.recordResourceSize(entry);
                }
            }
        });
        observer.observe({ entryTypes: ['resource'] });
    }

    /**
     * Monitor cache performance
     */
    monitorCachePerformance() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            // Track cache hit rates
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    this.analyzeCachePerformance(entry);
                }
            });
            observer.observe({ entryTypes: ['resource'] });
        }
    }

    /**
     * Monitor network conditions
     */
    monitorNetworkConditions() {
        if ('connection' in navigator) {
            const connection = navigator.connection;

            this.recordNetworkInfo({
                effectiveType: connection.effectiveType,
                downlink: connection.downlink,
                rtt: connection.rtt,
                saveData: connection.saveData
            });

            connection.addEventListener('change', () => {
                this.recordNetworkInfo({
                    effectiveType: connection.effectiveType,
                    downlink: connection.downlink,
                    rtt: connection.rtt,
                    saveData: connection.saveData
                });
            });
        }
    }

    /**
     * Set up user experience metrics
     */
    setupUserExperienceMetrics() {
        // Track page visibility
        document.addEventListener('visibilitychange', () => {
            this.recordUserEngagement('visibility-change', {
                visible: !document.hidden,
                timestamp: Date.now()
            });
        });

        // Track user session duration
        this.sessionStartTime = Date.now();
        window.addEventListener('beforeunload', () => {
            this.recordUserEngagement('session-duration', {
                duration: Date.now() - this.sessionStartTime,
                timestamp: Date.now()
            });
        });

        // Track error rates
        window.addEventListener('error', (event) => {
            this.recordError('javascript-error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                timestamp: Date.now()
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.recordError('unhandled-promise-rejection', {
                reason: event.reason?.toString() || 'Unknown',
                timestamp: Date.now()
            });
        });
    }

    /**
     * Set up performance reporting
     */
    setupPerformanceReporting() {
        // Report metrics periodically
        setInterval(() => {
            this.generatePerformanceReport();
        }, 30000); // Every 30 seconds

        // Report on page unload
        window.addEventListener('beforeunload', () => {
            this.sendPerformanceData();
        });

        // Report on visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.sendPerformanceData();
            }
        });
    }

    /**
     * Record navigation metrics
     */
    recordNavigationMetrics(entry) {
        const metrics = {
            type: 'navigation',
            timestamp: Date.now(),
            dns: entry.domainLookupEnd - entry.domainLookupStart,
            tcp: entry.connectEnd - entry.connectStart,
            tls: entry.secureConnectionStart > 0 ? entry.connectEnd - entry.secureConnectionStart : 0,
            ttfb: entry.responseStart - entry.requestStart,
            download: entry.responseEnd - entry.responseStart,
            domInteractive: entry.domInteractive - entry.navigationStart,
            domComplete: entry.domComplete - entry.navigationStart,
            loadComplete: entry.loadEventEnd - entry.navigationStart
        };

        this.performanceData.navigation.push(metrics);
    }

    /**
     * Record resource metrics
     */
    recordResourceMetrics(entry) {
        const metrics = {
            name: entry.name,
            type: this.getResourceType(entry.name),
            duration: entry.duration,
            size: entry.transferSize,
            cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
            timestamp: Date.now()
        };

        this.performanceData.resources.push(metrics);
    }

    /**
     * Record paint metrics
     */
    recordPaintMetrics(entry) {
        this.performanceData.marks.push({
            name: entry.name,
            startTime: entry.startTime,
            timestamp: Date.now()
        });
    }

    /**
     * Record layout shift
     */
    recordLayoutShift(entry) {
        this.recordCustomMetric('layout-shift', {
            value: entry.value,
            hadRecentInput: entry.hadRecentInput,
            timestamp: Date.now()
        });
    }

    /**
     * Record long task
     */
    recordLongTask(entry) {
        this.recordCustomMetric('long-task', {
            duration: entry.duration,
            startTime: entry.startTime,
            timestamp: Date.now()
        });
    }

    /**
     * Record vital metric
     */
    recordVital(vitalName, value) {
        this.performanceData.vitals[vitalName] = {
            value,
            timestamp: Date.now(),
            good: value < this.thresholds[vitalName],
            rating: this.getRating(vitalName, value)
        };

        console.log(`🎯 ${vitalName}: ${value.toFixed(2)}ms (${this.getRating(vitalName, value)})`);
    }

    /**
     * Record custom metric
     */
    recordCustomMetric(metricName, data) {
        if (!this.metrics.has(metricName)) {
            this.metrics.set(metricName, []);
        }
        this.metrics.get(metricName).push(data);
    }

    /**
     * Record resource size
     */
    recordResourceSize(entry) {
        this.recordCustomMetric('resource-size', {
            name: entry.name,
            type: this.getResourceType(entry.name),
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
            timestamp: Date.now()
        });
    }

    /**
     * Analyze cache performance
     */
    analyzeCachePerformance(entry) {
        const isCached = entry.transferSize === 0 && entry.decodedBodySize > 0;
        const isFromServiceWorker = entry.transferSize === 0 && entry.duration < 50;

        this.recordCustomMetric('cache-performance', {
            name: entry.name,
            isCached,
            isFromServiceWorker,
            duration: entry.duration,
            timestamp: Date.now()
        });
    }

    /**
     * Record network information
     */
    recordNetworkInfo(info) {
        this.recordCustomMetric('network-info', {
            ...info,
            timestamp: Date.now()
        });
    }

    /**
     * Record user engagement
     */
    recordUserEngagement(eventType, data) {
        this.recordCustomMetric('user-engagement', {
            eventType,
            ...data
        });
    }

    /**
     * Record error
     */
    recordError(errorType, data) {
        this.recordCustomMetric('error', {
            errorType,
            ...data
        });
    }

    /**
     * Get resource type from name
     */
    getResourceType(name) {
        if (name.includes('.js')) return 'script';
        if (name.includes('.css')) return 'stylesheet';
        if (name.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
        if (name.includes('.woff') || name.includes('.ttf')) return 'font';
        return 'other';
    }

    /**
     * Get performance rating
     */
    getRating(vitalName, value) {
        const threshold = this.thresholds[vitalName];
        if (vitalName === 'CLS') {
            if (value < 0.1) return 'good';
            if (value < 0.25) return 'needs-improvement';
            return 'poor';
        }

        if (value < threshold) return 'good';
        if (value < threshold * 1.5) return 'needs-improvement';
        return 'poor';
    }

    /**
     * Generate performance report
     */
    generatePerformanceReport() {
        const report = {
            timestamp: Date.now(),
            vitals: this.performanceData.vitals,
            navigation: this.getAverageNavigationMetrics(),
            resources: this.getResourceSummary(),
            customMetrics: this.getCustomMetricsSummary(),
            recommendations: this.getPerformanceRecommendations()
        };

        console.log('📊 Performance Report:', report);
        return report;
    }

    /**
     * Get average navigation metrics
     */
    getAverageNavigationMetrics() {
        if (this.performanceData.navigation.length === 0) return null;

        const latest = this.performanceData.navigation[this.performanceData.navigation.length - 1];
        return {
            ttfb: latest.ttfb,
            domInteractive: latest.domInteractive,
            domComplete: latest.domComplete,
            loadComplete: latest.loadComplete
        };
    }

    /**
     * Get resource summary
     */
    getResourceSummary() {
        const resources = this.performanceData.resources;
        return {
            total: resources.length,
            totalSize: resources.reduce((sum, r) => sum + (r.size || 0), 0),
            cached: resources.filter(r => r.cached).length,
            averageDuration: resources.length > 0
                ? resources.reduce((sum, r) => sum + r.duration, 0) / resources.length
                : 0
        };
    }

    /**
     * Get custom metrics summary
     */
    getCustomMetricsSummary() {
        const summary = {};
        for (const [metricName, data] of this.metrics.entries()) {
            summary[metricName] = {
                count: data.length,
                latest: data[data.length - 1],
                average: data.length > 0 ? this.getAverageForMetric(data) : null
            };
        }
        return summary;
    }

    /**
     * Get average for metric
     */
    getAverageForMetric(data) {
        if (data.length === 0) return null;

        const numericValues = data
            .map(item => item.duration || item.value)
            .filter(val => typeof val === 'number');

        return numericValues.length > 0
            ? numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length
            : null;
    }

    /**
     * Get performance recommendations
     */
    getPerformanceRecommendations() {
        const recommendations = [];

        // Check Web Vitals
        Object.entries(this.performanceData.vitals).forEach(([vital, data]) => {
            if (data.rating === 'poor') {
                recommendations.push({
                    category: 'web-vitals',
                    vital,
                    message: `${vital} is ${data.rating} (${data.value.toFixed(2)}). Consider optimization.`,
                    priority: 'high'
                });
            }
        });

        // Check resource sizes
        const largeResources = this.performanceData.resources
            .filter(r => r.size > 500000); // > 500KB

        if (largeResources.length > 0) {
            recommendations.push({
                category: 'resources',
                message: `${largeResources.length} large resources detected. Consider compression or code splitting.`,
                priority: 'medium'
            });
        }

        // Check long tasks
        const longTasks = this.metrics.get('long-task') || [];
        if (longTasks.length > 5) {
            recommendations.push({
                category: 'performance',
                message: 'Multiple long tasks detected. Consider breaking up JavaScript work.',
                priority: 'medium'
            });
        }

        return recommendations;
    }

    /**
     * Send performance data to analytics
     */
    sendPerformanceData() {
        const data = this.generatePerformanceReport();

        // Mock implementation - would send to analytics service
        console.log('📤 Sending performance data:', data);

        // In production, this would send to your analytics service
        // Example: fetch('/api/analytics/performance', { method: 'POST', body: JSON.stringify(data) })
    }

    /**
     * Get current performance status
     */
    getPerformanceStatus() {
        const vitals = this.performanceData.vitals;
        const poorVitals = Object.entries(vitals).filter(([_, data]) => data.rating === 'poor');

        return {
            overall: poorVitals.length === 0 ? 'good' : poorVitals.length < 2 ? 'fair' : 'poor',
            vitals,
            recommendations: this.getPerformanceRecommendations().length
        };
    }

    /**
     * Clear performance data
     */
    clearPerformanceData() {
        this.metrics.clear();
        this.performanceData = {
            navigation: [],
            resources: [],
            marks: [],
            measures: [],
            vitals: {}
        };
    }
}

// Export for SPA Manager
window.SPAPerformance = SPAPerformance;