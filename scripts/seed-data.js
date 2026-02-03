#!/usr/bin/env node

/**
 * Seed Data Script for Knowledge Foyer
 *
 * Creates sample users, articles, and other test data for development
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const User = require('../src/models/User');
const Article = require('../src/models/Article');
const { testConnection } = require('../src/config/database');

// Sample data
const SAMPLE_USERS = [
    {
        username: 'alice',
        email: 'alice@example.com',
        password: 'password123',
        display_name: 'Alice Chen',
        bio: 'Software architect passionate about clean code and system design. Love sharing insights about scalable web applications.'
    },
    {
        username: 'bob',
        email: 'bob@example.com',
        password: 'password123',
        display_name: 'Bob Rodriguez',
        bio: 'Full-stack developer and technical writer. Enjoy exploring new technologies and explaining complex concepts simply.'
    },
    {
        username: 'carol',
        email: 'carol@example.com',
        password: 'password123',
        display_name: 'Carol Kim',
        bio: 'UX designer who codes. Bridging the gap between design and development with practical insights.'
    },
    {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        display_name: 'Test User',
        bio: 'A demo user for testing the Knowledge Foyer platform.'
    }
];

const SAMPLE_ARTICLES = [
    {
        title: 'Building Scalable Web Applications',
        content: `# Building Scalable Web Applications

When building web applications that need to handle growth, there are several key principles to keep in mind:

## Architecture Patterns

**Microservices vs Monolith**: Start with a monolith, then extract services as needed. This approach reduces complexity early on while maintaining the option to scale specific components later.

**Database Design**: Plan for read replicas and data partitioning from the beginning. Even if you don't implement them immediately, having a schema that supports these patterns will save time later.

## Performance Considerations

**Caching Strategy**: Implement caching at multiple levels - database query results, computed values, and full page responses. Redis is excellent for this.

**Load Balancing**: Use nginx or similar reverse proxies to distribute traffic across multiple application instances.

## Monitoring and Observability

You can't optimize what you can't measure. Implement comprehensive logging, metrics, and distributed tracing from day one.

Remember: premature optimization is the root of all evil, but planning for scale is just good engineering.`,
        summary: 'A practical guide to building web applications that can handle growth, covering architecture patterns, performance optimization, and monitoring strategies.',
        visibility: 'public',
        username: 'alice'
    },
    {
        title: 'The Art of Technical Writing',
        content: `# The Art of Technical Writing

Good technical writing is like good code - it's clear, concise, and serves its purpose without unnecessary complexity.

## Know Your Audience

Before writing a single word, understand who will read your content:
- What's their technical background?
- What problem are they trying to solve?
- How much time do they have?

## Structure for Clarity

**Start with the conclusion**: Don't bury the lead. If someone has a specific problem, give them the solution upfront, then explain the reasoning.

**Use examples liberally**: Abstract concepts become clear when illustrated with concrete examples. Code snippets, screenshots, and real-world scenarios help readers connect theory to practice.

**Create scannable content**: Use headers, bullet points, and short paragraphs. Many readers will skim first, then dive deeper into relevant sections.

## Tools and Process

**Version control your docs**: Treat documentation like code. Use Git, review changes, and maintain consistency across contributors.

**Test your instructions**: Nothing is more frustrating than a tutorial that doesn't work. Test every step on a fresh environment.

The best technical writing disappears - readers accomplish their goals without thinking about the writing itself.`,
        summary: 'Essential principles and practices for writing clear, effective technical documentation that actually helps readers solve problems.',
        visibility: 'public',
        username: 'bob'
    },
    {
        title: 'Design Systems that Scale',
        content: `# Design Systems that Scale

A design system is more than just a collection of UI components - it's a shared language between design and development teams.

## Foundation First

**Color Palette**: Define semantic color tokens, not just brand colors. Instead of "blue-500", use "primary-action" or "warning-background".

**Typography Scale**: Create a modular scale that works across different screen sizes. Tools like [Modular Scale](https://www.modularscale.com/) can help establish harmonious proportions.

**Spacing System**: Use a consistent spacing scale (4px, 8px, 16px, 32px) that creates visual rhythm and makes layouts predictable.

## Component Architecture

**Atomic Design Principles**: Build from atoms (buttons) to molecules (search forms) to organisms (navigation bars). This hierarchy makes the system easier to understand and maintain.

**Accessibility by Default**: Every component should meet WCAG AA standards from the start. It's much harder to retrofit accessibility later.

## Documentation and Adoption

**Live Style Guide**: Use tools like Storybook or Figma to create interactive documentation that stays in sync with the actual components.

**Design Tokens**: Use platforms like Style Dictionary to maintain design tokens that can be consumed by both design tools and code.

The goal isn't perfection - it's consistency and efficiency across your product development process.`,
        summary: 'How to create and maintain design systems that improve consistency, efficiency, and collaboration between design and development teams.',
        visibility: 'public',
        username: 'carol'
    },
    {
        title: 'Welcome to Knowledge Foyer',
        content: `# Welcome to Knowledge Foyer

This is a demo article to showcase the features of Knowledge Foyer - a professional publishing platform for evolving work and structured feedback.

## Key Features

**Version Control**: Track changes to your articles over time, just like code.

**Structured Feedback**: Community-curated feedback that distinguishes utility from sentiment.

**Semantic Discovery**: Find content through tags and AI-powered recommendations.

**Real-time Collaboration**: MCP-powered WebSocket communication for live updates.

## Getting Started

1. Create an account and verify your email
2. Write your first article using Markdown
3. Publish to your personal subdomain (username.knowledgefoyer.com)
4. Engage with the community through thoughtful feedback

## Technology Stack

Knowledge Foyer is built with modern, scalable technologies:

- **Backend**: Node.js with Express and WebSocket support
- **Database**: PostgreSQL with pgvector for AI embeddings
- **Authentication**: JWT-based with email verification
- **Real-time**: MCP (Model Context Protocol) over WebSockets
- **AI Integration**: OpenAI API for feedback analysis and content discovery

This platform demonstrates how to build a complete, production-ready web application with advanced features like AI integration and real-time collaboration.

Happy publishing!`,
        summary: 'An introduction to Knowledge Foyer and its features for professional content publishing with community feedback and AI-powered discovery.',
        visibility: 'public',
        username: 'testuser'
    },
    {
        title: 'Advanced Database Optimization Techniques',
        content: `# Advanced Database Optimization Techniques

Database performance is often the bottleneck in web applications. Here are proven strategies to optimize your database operations.

## Query Optimization

**Index Strategy**: Don't just add indexes randomly. Use EXPLAIN ANALYZE to understand query execution plans and add indexes based on actual query patterns.

**Query Patterns**: Avoid N+1 queries by using joins or batching. ORMs make this easy to miss, so always profile your database queries in production-like environments.

**Pagination**: Use cursor-based pagination for large datasets instead of OFFSET. It's more efficient and provides consistent results even when data changes.

## Schema Design

**Normalization vs Denormalization**: Start normalized, then selectively denormalize based on read patterns. Document your decisions so future developers understand the trade-offs.

**Data Types**: Choose appropriate data types. Using TEXT when VARCHAR(255) would suffice wastes space and impacts index performance.

## Scaling Strategies

**Read Replicas**: Route read-only queries to replicas to reduce load on the primary database.

**Connection Pooling**: Use connection pools to manage database connections efficiently. Tools like PgBouncer for PostgreSQL are excellent for this.

**Caching**: Implement query result caching with Redis or Memcached. Cache invalidation is hard, but the performance gains are worth the complexity.

Remember: measure before optimizing, and optimize based on real usage patterns, not theoretical performance concerns.`,
        summary: 'Practical techniques for optimizing database performance, from query optimization to scaling strategies for high-traffic applications.',
        visibility: 'public',
        username: 'alice'
    }
];

/**
 * Create sample users
 */
async function createUsers() {
    console.log('📝 Creating sample users...');

    const createdUsers = [];

    for (const userData of SAMPLE_USERS) {
        try {
            // Check if user already exists
            const existing = await User.findByUsername(userData.username);
            if (existing) {
                console.log(`   ⏭️  User ${userData.username} already exists`);
                createdUsers.push(existing);
                continue;
            }

            const user = await User.create(userData);

            // Auto-verify email for development
            if (user.email_verification_token) {
                await user.verifyEmail(user.email_verification_token);
            }

            console.log(`   ✅ Created user: ${user.username} (${user.display_name})`);
            createdUsers.push(user);
        } catch (error) {
            console.error(`   ❌ Failed to create user ${userData.username}:`, error.message);
        }
    }

    return createdUsers;
}

/**
 * Create sample articles
 */
async function createArticles(users) {
    console.log('📰 Creating sample articles...');

    const userMap = {};
    users.forEach(user => {
        userMap[user.username] = user;
    });

    const createdArticles = [];

    for (const articleData of SAMPLE_ARTICLES) {
        try {
            const user = userMap[articleData.username];
            if (!user) {
                console.log(`   ⏭️  User ${articleData.username} not found, skipping article`);
                continue;
            }

            const article = await Article.create(user.id, {
                title: articleData.title,
                content: articleData.content,
                summary: articleData.summary,
                visibility: articleData.visibility
            });

            // Publish the article
            await article.publish(user.id);

            console.log(`   ✅ Created article: "${article.title}" by ${user.username}`);
            createdArticles.push(article);
        } catch (error) {
            console.error(`   ❌ Failed to create article "${articleData.title}":`, error.message);
        }
    }

    return createdArticles;
}

/**
 * Display summary of created data
 */
function displaySummary(users, articles) {
    console.log('\n🎉 Seed data creation complete!');
    console.log('================================');
    console.log(`📊 Created ${users.length} users and ${articles.length} articles\n`);

    console.log('👥 Users:');
    users.forEach(user => {
        console.log(`   • ${user.username} (${user.display_name})`);
    });

    console.log('\n📝 Articles:');
    articles.forEach(article => {
        const author = users.find(u => u.id === article.user_id);
        console.log(`   • "${article.title}" by ${author ? author.username : 'unknown'}`);
    });

    console.log('\n🌐 Test URLs:');
    console.log('   Main site: http://localhost/');
    console.log('   API stats: http://localhost/api/stats');
    console.log('   Alice\'s space: http://alice.localhost/');
    console.log('   Bob\'s space: http://bob.localhost/');
    console.log('   Test articles: http://testuser.localhost/welcome-to-knowledge-foyer');

    console.log('\n🔐 Test Credentials:');
    console.log('   Username: testuser');
    console.log('   Email: test@example.com');
    console.log('   Password: password123');
}

/**
 * Main execution function
 */
async function main() {
    try {
        console.log('🌱 Knowledge Foyer - Seed Data Generation');
        console.log('==========================================\n');

        // Test database connection first
        console.log('🔌 Testing database connection...');
        const connected = await testConnection();
        if (!connected) {
            console.error('❌ Cannot connect to database. Run database setup first.');
            process.exit(1);
        }

        // Create sample data
        const users = await createUsers();
        const articles = await createArticles(users);

        // Display summary
        displaySummary(users, articles);

        console.log('\n✅ Seed data generation completed successfully!');

    } catch (error) {
        console.error('❌ Seed data generation failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { main, createUsers, createArticles };