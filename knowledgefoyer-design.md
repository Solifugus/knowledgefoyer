# Knowledge Foyer - Design Document

## Executive Summary

Knowledge Foyer is a professional publishing platform where creators share evolving work and receive structured, quality feedback. Unlike traditional portfolios or social networks, Knowledge Foyer emphasizes semantic discovery through tags and community-curated feedback that helps creators continuously improve their work.

### Core Principles
- Content quality over engagement metrics
- Semantic discovery through tagging
- Structured feedback that distinguishes utility from sentiment
- Work as living documents that improve over time
- Professional credibility through demonstrated work

---

## Architecture Overview

### System Components

**Frontend**: Progressive Web Application using vanilla HTML, CSS, and JavaScript
- Responsive design for desktop, tablet, and mobile
- Minimal dependencies
- Service worker for offline capability and app-like experience
- WebSocket connection for MCP communication
- Real-time UI updates via MCP events

**Backend**: Node.js application server
- Hybrid architecture: MCP over WebSockets + REST endpoints
- Express framework for HTTP routing
- MCP server for authenticated interactions
- JWT-based authentication (works with both protocols)
- Email verification system

**Communication Protocols**:
- **MCP over WebSockets**: Primary protocol for authenticated user interactions
  - Real-time bidirectional communication
  - Tools for creating, updating, querying content
  - Live updates for feedback rankings
  - AI-powered features integration
- **REST over HTTP**: Supporting protocol for specific use cases
  - Initial page loads and server-side rendering
  - OAuth flows (Google sign-in, future integrations)
  - Public content delivery (SEO-friendly)
  - Static asset serving
  - File uploads (future)

**Database**: PostgreSQL relational database
- ACID compliance for data integrity
- Full-text search capabilities
- Efficient indexing for tag-based queries
- pgvector extension for embedding storage and similarity search

**AI Services**: OpenAI API integration
- Embedding generation for semantic similarity
- Duplicate feedback detection
- Addressed feedback analysis
- No local GPU required

**Multi-tenancy**: Subdomain-based user spaces
- Wildcard DNS routing (*.knowledgefoyer.com)
- User content isolated by subdomain
- Shared platform services

### MCP Architecture

**Protocol Choice Rationale**:
- MCP provides structured, typed communication between client and AI-native backend
- WebSocket persistence enables real-time updates without polling
- Tool-based architecture maps naturally to user actions
- Future-proof for AI agent integration
- Demonstrates cutting-edge protocol adoption

**MCP Server Implementation**:
- Single persistent WebSocket connection per authenticated user
- Connection established after initial page load
- JWT token passed in WebSocket handshake for authentication
- Automatic reconnection with exponential backoff
- Message queuing during disconnection

**MCP Tools** (user-initiated actions):
- `create_article`: Publish new article with title, content, tags
- `update_article`: Create new version with change summary
- `delete_article`: Soft delete article
- `submit_feedback`: Add feedback to article
- `rank_feedback`: Vote on feedback utility (positive/negative/ignore)
- `search_articles`: Query with filters and tags
- `get_article`: Retrieve article with metadata
- `get_feedback_rankings`: Fetch ranked feedback for article
- `get_unranked_queue`: Personal queue of unranked feedback
- `get_version_history`: Article revision history
- `check_feedback_similarity`: AI-powered duplicate detection
- `update_profile`: Modify user bio and display name

**MCP Resources** (server-provided data):
- `article://{article_id}`: Article content and metadata
- `feedback://{article_id}`: All feedback for article
- `rankings://{article_id}`: Current utility scores
- `queue://unranked`: Personal unranked feedback queue
- `profile://{username}`: User profile data
- `tags://popular`: Popular tags list
- `tags://{tag_name}`: Articles with specific tag

**MCP Prompts** (AI-assisted workflows):
- `analyze_feedback`: Determine if feedback was addressed in version change
- `suggest_tags`: Recommend tags based on article content
- `detect_duplicates`: Find similar existing feedback

**Real-time Events** (server-initiated updates):
- `feedback_ranked`: Notify when someone ranks feedback on your article
- `feedback_addressed`: Notify when your feedback was marked addressed
- `article_updated`: Notify followers when followed author publishes
- `ranking_updated`: Live update to feedback ranking counts

**WebSocket Message Format**:
```
Client → Server (tool call):
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "tools/call",
  "params": {
    "name": "rank_feedback",
    "arguments": {
      "feedback_id": "uuid",
      "positive_utility": true,
      "negative_utility": false,
      "ignored": false
    }
  }
}

Server → Client (result):
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "success": true,
    "feedback_id": "uuid",
    "new_positive_count": 47,
    "new_negative_count": 23
  }
}

Server → Client (event):
{
  "jsonrpc": "2.0",
  "method": "notifications/message",
  "params": {
    "level": "info",
    "event": "ranking_updated",
    "data": {
      "feedback_id": "uuid",
      "positive_count": 48,
      "negative_count": 23
    }
  }
}
```

**Connection Lifecycle**:
1. User loads page via REST (HTML/CSS/JS)
2. JavaScript establishes WebSocket connection
3. Handshake includes JWT token for authentication
4. Server initializes MCP session
5. Client can now call tools and receive events
6. Connection persists throughout session
7. Automatic reconnection if disconnected
8. Graceful degradation to polling if WebSocket unavailable

**Hybrid REST + MCP Decision Matrix**:

Use REST for:
- Initial page loads (/, /articles/:slug, /:username)
- OAuth callbacks (/auth/google/callback)
- Email verification links (/verify?token=...)
- Public JSON feeds (for SEO, RSS, etc.)
- Health checks and monitoring
- Static assets

Use MCP for:
- All authenticated CRUD operations
- Real-time data updates
- AI-powered features
- Interactive feedback ranking
- Search and filtering
- Personal data queries

---

## Data Models

### User Account
Represents an author on the platform.

**Fields**:
- user_id (primary key, UUID)
- username (unique, lowercase, alphanumeric with underscores)
- email (unique, validated)
- email_verified (boolean)
- verification_token (nullable, expires)
- password_hash (bcrypt)
- display_name
- bio (optional)
- created_at (timestamp)
- last_login (timestamp)

**Constraints**:
- Username becomes subdomain (username.knowledgefoyer.com)
- Username restrictions: 3-30 characters, lowercase letters, numbers, underscores only
- Email must be verified before publishing

### Article
Represents a piece of published work.

**Fields**:
- article_id (primary key, UUID)
- author_id (foreign key to user)
- title
- slug (URL-friendly, unique per author)
- content (text, markdown supported)
- content_type (enum: essay, code, project, mixed)
- current_version (integer)
- created_at (timestamp)
- updated_at (timestamp)
- published (boolean)
- view_count (integer)

**Constraints**:
- Slug must be unique per author
- Title limited to 200 characters
- Content stored as markdown with sanitization

### Article Version
Tracks revision history for articles.

**Fields**:
- version_id (primary key, UUID)
- article_id (foreign key to article)
- version_number (integer, increments)
- content (text, full snapshot)
- change_summary (text, author-provided)
- created_at (timestamp)
- created_by (foreign key to user)

**Constraints**:
- Version numbers are sequential per article
- Each version stores complete content snapshot

### Tag
Represents semantic categories for content discovery.

**Fields**:
- tag_id (primary key, UUID)
- tag_name (unique, lowercase)
- description (optional)
- usage_count (integer, denormalized for performance)
- created_at (timestamp)

**Constraints**:
- Tag names: lowercase, alphanumeric with hyphens
- Maximum 50 characters per tag

### Article Tag Association
Many-to-many relationship between articles and tags.

**Fields**:
- article_id (foreign key to article)
- tag_id (foreign key to tag)
- added_at (timestamp)

**Constraints**:
- Composite primary key (article_id, tag_id)
- Maximum 20 tags per article

### Follow
Represents author following relationships.

**Fields**:
- follow_id (primary key, UUID)
- follower_id (foreign key to user - who is following)
- followee_id (foreign key to user - who is being followed)
- created_at (timestamp)

**Constraints**:
- Composite unique index on (follower_id, followee_id)
- Cannot follow yourself (follower_id != followee_id)

### Message
Author messages and article announcements (like Twitter but longer).

**Fields**:
- message_id (primary key, UUID)
- author_id (foreign key to user)
- content (text)
- article_id (nullable, foreign key to article if announcing)
- article_version (nullable, integer - which version if revision announcement)
- message_type (enum: user_post, article_publish, article_revision)
- created_at (timestamp)
- edited_at (nullable, timestamp)

**Constraints**:
- Content limited to 2000 characters
- If message_type is article_publish or article_revision, article_id must be set
- If message_type is article_revision, article_version must be set

### Custom Exposition Page
Author-curated pages that aggregate articles by criteria.

**Fields**:
- exposition_id (primary key, UUID)
- author_id (foreign key to user)
- title
- slug (unique per author)
- description (optional)
- created_at (timestamp)
- updated_at (timestamp)
- published (boolean)

**Constraints**:
- Slug unique per author
- Title limited to 200 characters
- Description limited to 1000 characters

### Exposition Criteria
Defines what articles appear on a custom exposition page.

**Fields**:
- criterion_id (primary key, UUID)
- exposition_id (foreign key to exposition page)
- criterion_type (enum: author, tag)
- criterion_value (username if type=author, tag_name if type=tag)
- added_at (timestamp)

**Constraints**:
- Composite unique index on (exposition_id, criterion_type, criterion_value)
- Maximum 50 criteria per exposition page
- OR logic: articles matching ANY criterion appear on page

### Feedback
Comments and critique on articles.

**Fields**:
- feedback_id (primary key, UUID)
- article_id (foreign key to article)
- article_version (integer, which version this addresses)
- author_id (foreign key to user)
- content (text)
- embedding (vector(1536), for similarity search via pgvector)
- created_at (timestamp)
- status (enum: active, addressed, ignored_by_ai, manually_restored)
- ai_similarity_score (nullable, for duplicate detection)

**Constraints**:
- Content limited to 2000 characters
- Author cannot provide feedback on own articles
- Embedding generated via OpenAI API on creation

### Feedback Ranking
Tracks user votes on feedback utility.

**Fields**:
- ranking_id (primary key, UUID)
- feedback_id (foreign key to feedback)
- user_id (foreign key to user)
- positive_utility (boolean)
- negative_utility (boolean)
- ignored (boolean)
- ranked_at (timestamp)

**Constraints**:
- One ranking record per user per feedback item
- At least one of positive_utility, negative_utility, or ignored must be true

### Feedback Utility Scores
Denormalized view for performance (materialized or computed).

**Fields**:
- feedback_id (foreign key to feedback)
- positive_vote_count (integer)
- negative_vote_count (integer)
- ignore_count (integer)
- total_rankings (integer)

**Purpose**:
- Quick retrieval for ranked feedback display
- Updated when new rankings are created

### Feedback Resolution
Tracks which feedback was addressed in version changes.

**Fields**:
- resolution_id (primary key, UUID)
- feedback_id (foreign key to feedback)
- article_version_from (integer)
- article_version_to (integer)
- marked_addressed_at (timestamp)
- ai_confidence (float, how sure AI is this was addressed)

**Purpose**:
- Credit system for helpful feedback
- Version history of improvements

---

## User Flows

### Registration and Email Verification

**Registration Process**:
1. User submits username, email, password on landing page
2. System validates username availability and format
3. System creates user record with email_verified = false
4. System generates unique verification_token with 24-hour expiry
5. System sends verification email with token link
6. User clicks link, system verifies token and marks email_verified = true
7. User can now log in and publish content

**Email Verification Link Format**:
- https://knowledgefoyer.com/verify?token={verification_token}

**Token Expiry Handling**:
- After 24 hours, user must request new verification email
- Old tokens are invalidated when new ones are generated

### Publishing an Article

**Publication Flow**:
1. Author navigates to their subdomain (username.knowledgefoyer.com)
2. Author creates new article with title, content, tags
3. System generates URL slug from title (or accepts custom)
4. Author previews rendering
5. Author publishes (sets published = true)
6. System creates initial version record (version 1)
7. Article appears in author's foyer and global article directory
8. Article is discoverable via tags

**Slug Generation**:
- Title converted to lowercase
- Spaces and special characters replaced with hyphens
- Sequential numbers appended if slug exists for that author

### Browsing and Discovery

**Landing Page (knowledgefoyer.com)**:
- Article directory: recent articles, sorted by publication date
- Tag filter: dropdown or search to filter by tags
- Author directory: alphabetical list of authors with article counts
- Search capability: full-text search across articles

**Author Subdomain (username.knowledgefoyer.com)**:
- Author profile information
- List of published articles
- Tag cloud of author's most-used tags
- Link back to main directory

**Exposition Pages (tag-based discovery)**:
- URL: knowledgefoyer.com/tags/{tag_name}
- Shows all articles with that tag
- Groups related work across different authors
- Sorts by relevance or recency

### Providing Feedback

**Feedback Submission** (via MCP):
1. Reader navigates to article (REST page load)
2. WebSocket MCP connection established (if not already)
3. Reader clicks "Add Feedback" (requires author account and login)
4. Reader writes feedback (2000 character limit)
5. Client calls `check_feedback_similarity` MCP tool with article_id and feedback text
6. Server generates embedding via OpenAI API
7. Server queries pgvector for similar feedback (cosine similarity)
8. If similar feedback exists (similarity > 0.85):
   - Server calls OpenAI GPT-4 to analyze differences
   - Server returns similarity_check response with existing feedback and analysis
   - Client shows comparison: "This appears similar to: [existing]. Your addition: [difference]. Still submit?"
   - User confirms or cancels
9. If confirmed (or no duplicates), client calls `submit_feedback` MCP tool
10. Server saves feedback with generated embedding
11. Server broadcasts `new_feedback` event to article author via WebSocket
12. Feedback appears in unranked pool for all users

**MCP Tool Call Example**:
```
Client sends:
{
  "method": "tools/call",
  "params": {
    "name": "check_feedback_similarity",
    "arguments": {
      "article_id": "uuid-here",
      "feedback_text": "The sync logic has race conditions..."
    }
  }
}

Server responds (if similar found):
{
  "result": {
    "similar_feedback": [{
      "feedback_id": "other-uuid",
      "content": "Race condition in temporal sync",
      "similarity_score": 0.89,
      "author": "sarah_dev"
    }],
    "analysis": "Your feedback adds specific timing analysis..."
  }
}

User confirms, client sends:
{
  "method": "tools/call",
  "params": {
    "name": "submit_feedback",
    "arguments": {
      "article_id": "uuid-here",
      "content": "The sync logic has race conditions..."
    }
  }
}
```

### Ranking Feedback

**Ranking Interface** (via MCP):
1. User views article (REST page load)
2. WebSocket MCP connection established
3. Client calls `get_article_feedback` MCP tool to load ranked sections
4. Server returns ranked positive/negative feedback arrays
5. Client calls `get_unranked_queue` MCP tool for article
6. Server returns next unranked item and total remaining count
7. Unranked item displays with three buttons in random order:
   - Thumbs up for positive utility
   - Thumbs up for negative utility  
   - Ignore
8. User clicks one or more buttons
9. Client immediately updates UI (optimistic update)
10. Client calls `rank_feedback` MCP tool with votes
11. Server saves ranking, updates denormalized counts
12. Server broadcasts `ranking_updated` event to all connected clients viewing this article
13. All clients receive event and update their displays in real-time
14. Ranked item disappears from user's personal queue
15. Client calls `get_unranked_queue` again to load next item
16. Process repeats

**MCP Tool Call Example**:
```
Client sends:
{
  "method": "tools/call",
  "params": {
    "name": "rank_feedback",
    "arguments": {
      "feedback_id": "uuid-here",
      "positive_utility": true,
      "negative_utility": false,
      "ignored": false
    }
  }
}

Server responds:
{
  "result": {
    "success": true,
    "feedback_id": "uuid-here",
    "new_counts": {
      "positive": 48,
      "negative": 23,
      "ignore": 5
    }
  }
}

Server broadcasts to all connected clients:
{
  "method": "notifications/message",
  "params": {
    "level": "info",
    "event": "ranking_updated",
    "data": {
      "feedback_id": "uuid-here",
      "positive_count": 48,
      "negative_count": 23
    }
  }
}
```

**Ranked Section Display**:
- Items sorted by vote count descending
- Shows vote count for transparency
- Vertically scrollable
- Global view (everyone sees same rankings)
- Updates in real-time as others vote

**Personal Unranked Queue**:
- Contains all feedback user hasn't ranked yet
- Includes highly-ranked items user personally hasn't voted on
- Randomized order to prevent position bias
- Persists across sessions (stored in database)
- One item at a time to maintain focus

### Revising an Article

**Revision Process** (via MCP and OpenAI):
1. Author edits article content in UI
2. Author provides change summary
3. Author calls `update_article` MCP tool with new content and summary
4. Server increments version number
5. Server creates new version record with full content snapshot
6. Server generates diff between old and new versions
7. Server retrieves all active negative feedback for article
8. For each negative feedback item:
   - Server calls OpenAI GPT-4 API with prompt template
   - Prompt includes: old version, new version, diff, feedback text
   - GPT-4 returns: {addressed: boolean, confidence: float, explanation: string}
   - High confidence (>0.8): mark status = addressed, create resolution record
   - Medium confidence (0.5-0.8): flag for author review
   - Low confidence (<0.5): leave status = active
9. Server returns list of addressed feedback with confidence scores
10. Server broadcasts `feedback_addressed` events to feedback authors
11. Positive feedback persists (marks strengths, not issues to fix)
12. Author sees which feedback was marked addressed
13. Author can manually restore feedback if AI made mistake (updates status to manually_restored)

**OpenAI API Call for Analysis**:
```
Prompt to GPT-4:
---
Article Version 2:
[old content here]

Article Version 3:
[new content here]

Changes:
[generated diff]

Feedback: "The sync logic has race conditions in the cursor transition code."

Was this feedback addressed in the version changes?
Respond with JSON only:
{
  "addressed": boolean,
  "confidence": 0.0 to 1.0,
  "explanation": "brief reasoning"
}
---

Example Response:
{
  "addressed": true,
  "confidence": 0.92,
  "explanation": "Added mutex locks to cursor transition methods, directly addressing the race condition concern"
}
```

**MCP Tool Call Example**:
```
Client sends:
{
  "method": "tools/call",
  "params": {
    "name": "update_article",
    "arguments": {
      "article_id": "uuid-here",
      "content": "updated markdown content...",
      "change_summary": "Fixed race conditions in sync logic",
      "tags": ["consciousness", "ai", "pattern-learning"]
    }
  }
}

Server responds (after OpenAI analysis):
{
  "result": {
    "success": true,
    "new_version_number": 3,
    "updated_at": "2026-01-20T...",
    "addressed_feedback": [
      {
        "feedback_id": "uuid-1",
        "confidence": 0.92,
        "explanation": "Added mutex locks...",
        "author": "sarah_dev"
      },
      {
        "feedback_id": "uuid-2",
        "confidence": 0.65,
        "explanation": "Partially addressed...",
        "author": "mike_sys",
        "needs_review": true
      }
    ],
    "unaddressed_feedback": [
      {
        "feedback_id": "uuid-3",
        "reason": "Different concern not touched by changes"
      }
    ]
  }
}
```

**Manual Override**:
- Author dashboard shows addressed feedback with confidence scores
- Author can call `restore_feedback` tool to revert status to active
- System tracks manual restorations for future AI improvement
- Low-confidence items flagged for manual review

### Feedback Resolution and Credit

**When Feedback is Marked Addressed**:
- Creates resolution record linking feedback to version transition
- Feedback moves to article's version history view
- Contributor receives credit notification
- Contributor's profile shows improvement contributions

**Credit Display**:
- On article version history: "v2 → v3: Addressed feedback by @username"
- On contributor profile: "Helped improve X articles with Y feedback items"
- Feedback item itself shows "(Addressed in v3)" badge

### Following Authors

**Following Flow** (via MCP):
1. User views author's profile or article
2. User clicks "Follow" button
3. Client calls `follow_author` MCP tool with username
4. Server creates follow relationship
5. Server broadcasts `new_follower` event to followed author
6. Client updates button to "Following"
7. User now receives followed author's messages in feed
8. User receives notifications when followed author publishes

**Unfollowing**:
- Click "Following" button to unfollow
- Confirmation dialog
- Call `unfollow_author` tool
- No longer receives author's messages in feed

### Messaging System

**Posting a Message** (via MCP):
1. User writes message (up to 2000 characters)
2. Optional: attach article link for announcement
3. Client calls `post_message` tool with content and optional article_id
4. Server creates message record
5. If article_id provided:
   - Server determines message_type (article_publish or article_revision)
   - Sets article_version to current version
6. Server broadcasts `new_message` event to all followers
7. Message appears in followers' feeds
8. Message appears on author's profile

**Automatic Article Announcements**:
- When author calls `create_article` (publish new):
  - Server automatically creates message with message_type = article_publish
  - Message includes article title and link
  - Optional: author can add custom announcement text
  - Broadcasts to all followers
  
- When author calls `update_article` (revision):
  - Server automatically creates message with message_type = article_revision
  - Message includes change summary and link
  - Optional: author can add commentary
  - Broadcasts to all followers

**Feed Timeline** (via MCP):
1. User navigates to feed page
2. Client calls `get_feed` tool with pagination
3. Server returns messages from all followed authors, chronological
4. Client displays with real-time updates via `new_message` events
5. Messages show:
   - Author name and avatar
   - Message content
   - Timestamp
   - Linked article (if announcement)
   - Article version (if revision announcement)

**MCP Tool Call Example**:
```
Publish new article (triggers automatic message):
Client sends:
{
  "method": "tools/call",
  "params": {
    "name": "create_article",
    "arguments": {
      "title": "Contemplative Cursor Framework",
      "content": "...",
      "tags": ["consciousness", "ai"],
      "announcement_text": "Excited to share my new framework..."
    }
  }
}

Server responds:
{
  "result": {
    "article_id": "uuid",
    "message_id": "msg-uuid",
    "url": "matthew.knowledgefoyer.com/contemplative-cursor"
  }
}

Server broadcasts to all followers:
{
  "method": "notifications/message",
  "params": {
    "event": "new_message",
    "data": {
      "message_id": "msg-uuid",
      "author": "matthew",
      "message_type": "article_publish",
      "article_id": "uuid",
      "preview": "Excited to share my new framework..."
    }
  }
}
```

### Creating Custom Exposition Pages

**Creation Flow** (via MCP):
1. Author navigates to "Create Exposition" page
2. Author provides:
   - Title (e.g., "AI Consciousness Research")
   - Slug (e.g., "ai-consciousness")
   - Description (optional, explains the collection)
3. Client calls `create_exposition` tool
4. Server creates exposition page (unpublished initially)
5. Author adds criteria:
   - Click "Add Author" → call `add_exposition_criterion` with type=author, value=username
   - Click "Add Tag" → call `add_exposition_criterion` with type=tag, value=tag_name
   - Can add multiple of each
6. Server queries articles matching ANY criterion (OR logic)
7. Author previews matching articles
8. Author calls `publish_exposition` to make public
9. Exposition appears at `matthew.knowledgefoyer.com/expositions/ai-consciousness`

**Viewing Exposition Page**:
- Page displays:
  - Title and description
  - Criteria used (authors and/or tags)
  - All articles matching ANY criterion
  - Sorted by publication date or relevance
  - Updates automatically as new matching articles published

**Example Criteria Combinations**:
- "Articles by @alice OR @bob" → shows all work from both authors
- "Articles tagged #ai OR #consciousness" → shows all with either tag
- "Articles by @alice OR tagged #philosophy" → alice's work + all philosophy
- Maximum 50 criteria to prevent abuse

**MCP Tool Call Example**:
```
Create exposition:
{
  "method": "tools/call",
  "params": {
    "name": "create_exposition",
    "arguments": {
      "title": "AI Consciousness Research",
      "slug": "ai-consciousness",
      "description": "Exploring consciousness through AI and philosophy"
    }
  }
}

Add criteria:
{
  "method": "tools/call",
  "params": {
    "name": "add_exposition_criterion",
    "arguments": {
      "exposition_id": "expo-uuid",
      "criterion_type": "tag",
      "criterion_value": "consciousness"
    }
  }
}

{
  "method": "tools/call",
  "params": {
    "name": "add_exposition_criterion",
    "arguments": {
      "exposition_id": "expo-uuid",
      "criterion_type": "author",
      "criterion_value": "alice"
    }
  }
}

Get matching articles:
{
  "method": "tools/call",
  "params": {
    "name": "get_exposition",
    "arguments": {
      "exposition_id": "expo-uuid"
    }
  }
}

Server returns:
{
  "result": {
    "exposition": {
      "title": "AI Consciousness Research",
      "description": "...",
      "author": "matthew"
    },
    "criteria": [
      {"type": "tag", "value": "consciousness"},
      {"type": "author", "value": "alice"}
    ],
    "articles": [
      // All articles tagged consciousness OR by alice
    ]
  }
}
```

---

## Feature Specifications

### Progressive Web App (PWA)

**Service Worker Requirements**:
- Cache static assets (CSS, JS, fonts, icons)
- Cache article content for offline reading
- Background sync for feedback submissions when offline
- Update notification when new version available

**Manifest Configuration**:
- App name: "Knowledge Foyer"
- Icons: various sizes for different devices
- Start URL: user's last visited page or home
- Display mode: standalone
- Theme color: primary brand color
- Background color: matches site background

**Responsive Design Breakpoints**:
- Mobile: < 768px
- Tablet: 768px - 1024px  
- Desktop: > 1024px

**Touch Interactions**:
- Larger tap targets on mobile (minimum 44x44px)
- Swipe gestures for navigation
- Pull-to-refresh on article lists

### Authentication System

**JWT Implementation**:
- Access tokens: short-lived (15 minutes)
- Refresh tokens: longer-lived (7 days), stored securely
- Tokens include: user_id, username, email_verified status
- Automatic refresh before expiry

**Email Verification**:
- Verification emails sent via SMTP or email service
- Template includes: username, verification link, expiry time
- Resend capability with rate limiting (max 3 per hour)
- Token stored hashed in database

**Password Requirements**:
- Minimum 12 characters
- Must include: uppercase, lowercase, number, special character
- Bcrypt hashing with cost factor 12
- Password reset via email token (similar to verification)

### Tag System

**Tag Creation**:
- Authors create tags while writing articles
- System suggests existing similar tags
- Auto-lowercasing and hyphenation
- Limits prevent tag spam

**Tag Discovery**:
- Tag cloud on landing page (sized by usage)
- Tag autocomplete in search
- Tag filtering with multiple selections (OR logic)
- Tag pages show related tags

**Tag Constraints**:
- Minimum 2 characters
- Maximum 50 characters
- Only lowercase letters, numbers, hyphens
- Reserved words cannot be tags (admin, login, etc.)

### Search Functionality

**Full-Text Search**:
- PostgreSQL full-text search with tsvector
- Searches across: titles, content, tags
- Ranked results by relevance
- Highlighting of matched terms

**Search Filters**:
- Filter by author
- Filter by tags (multiple)
- Filter by content type
- Date range filtering
- Sort by: relevance, date, popularity

**Search Performance**:
- GIN indexes on tsvector columns
- Materialized search cache for common queries
- Pagination with cursor-based approach

### Feedback AI Features

**OpenAI API Integration**:
- No local GPU required on hosting provider
- API key stored securely in environment variables
- Rate limiting to control costs
- Fallback behavior if API unavailable
- Error handling for API failures

**Duplicate Detection**:
- Embedding generation via OpenAI Embeddings API (text-embedding-3-small)
- Store embeddings in PostgreSQL using pgvector extension
- Vector similarity search using cosine distance
- Threshold configurable (default: 0.85 similarity = potential duplicate)
- Comparison explanation generated via GPT-4 API
- Option to submit anyway (not blocking)

**Duplicate Detection Flow**:
1. User submits feedback via `submit_feedback` MCP tool
2. System generates embedding for new feedback text
3. Query existing feedback embeddings for same article
4. Calculate cosine similarity scores
5. If any score exceeds threshold:
   - Call GPT-4 to generate comparison analysis
   - Return to user: similar feedback + difference explanation
   - User confirms or cancels submission
6. If confirmed, save feedback with similarity metadata

**Addressed Feedback Analysis**:
- Triggered when author calls `update_article` MCP tool
- System generates diff between versions
- For each active negative feedback:
  - Call GPT-4 with: old version, new version, feedback text
  - Prompt: "Was this critique addressed in the changes?"
  - Response includes: boolean decision, confidence score (0-1), explanation
- High confidence (>0.8): automatically mark addressed
- Medium confidence (0.5-0.8): flag for author review
- Low confidence (<0.5): leave active

**AI Analysis Prompt Template**:
```
Article Version {old}: [old content]
Article Version {new}: [new content]
Diff: [generated diff]

Feedback: "{feedback_text}"

Question: Was this feedback addressed in the version change?
Respond with JSON:
{
  "addressed": boolean,
  "confidence": float (0-1),
  "explanation": string (brief reasoning)
}
```

**Learning from Manual Overrides**:
- Track when authors manually restore addressed feedback
- Store: feedback_id, ai_decision, author_decision, article_id
- Future: use this data to fine-tune prompts or models
- Initially: just collect data for analysis

**OpenAI API Usage Optimization**:
- Cache embeddings (don't regenerate for existing feedback)
- Batch similar requests when possible
- Use cheaper models where appropriate (embeddings vs GPT-4)
- Set max_tokens limits on completion requests
- Implement request queuing to respect rate limits

**Cost Controls**:
- Daily API usage budget limit
- Alert when approaching limit
- Graceful degradation: disable AI features if budget exceeded
- Manual duplicate checking as fallback
- Manual addressed feedback marking as fallback

**API Error Handling**:
- Retry with exponential backoff for transient errors
- Circuit breaker pattern for sustained failures
- User-friendly error messages
- Log failures for monitoring
- Fallback to non-AI workflows

---

## Security Considerations

### Data Protection

**Input Sanitization**:
- All user input sanitized before storage
- Markdown rendered with safe subset (no raw HTML)
- SQL injection prevention via parameterized queries
- XSS prevention through output encoding

**Authentication Security**:
- HTTPS required for all traffic (WSS for WebSockets)
- JWT secrets stored in environment variables
- Refresh token rotation on use
- Session invalidation on password change
- WebSocket connections authenticated via JWT in handshake
- Token expiry enforced on WebSocket messages

**WebSocket-Specific Security**:
- Origin validation on WebSocket upgrade
- Rate limiting per connection (messages per minute)
- Message size limits to prevent DoS
- Connection limits per user (max 3 concurrent)
- Automatic disconnection after inactivity
- CSRF protection not needed (JWT-based auth)

**Rate Limiting**:
- Login attempts: 5 per 15 minutes per IP
- Email verification: 3 per hour per user
- Feedback submission: 10 per hour per user (via MCP)
- MCP tool calls: 100 per minute per user
- WebSocket messages: 60 per minute per connection
- OpenAI API calls: Tracked separately with daily budget

**CORS Configuration**:
- Strict origin checking for REST endpoints
- WebSocket origin validation in upgrade handler
- Credentials allowed only for same-origin
- Preflight caching for performance

### Privacy

**Data Minimization**:
- Collect only necessary user data
- No tracking pixels or third-party analytics
- Email only used for verification and critical notifications

**User Control**:
- Account deletion removes all personal data
- Published content can be unpublished (soft delete)
- Export all user data on request

**Public vs Private Data**:
- Published articles are public
- Email addresses never public
- Feedback authorship is public
- Rankings are anonymous (only counts visible)

---

## Performance Considerations

### Database Optimization

**Indexing Strategy**:
- Primary keys on all tables
- Foreign key indexes for joins
- Composite indexes for common query patterns
- GIN indexes for full-text search
- Index on (article_id, version_number) for version queries
- pgvector HNSW index on feedback embeddings for fast similarity search

**Query Optimization**:
- Pagination limits large result sets
- Denormalized vote counts to avoid aggregate queries
- Materialized views for complex analytics
- Connection pooling for database connections
- Prepared statements cached per connection

**Caching Strategy**:
- Redis for:
  - WebSocket session state
  - JWT token blacklist (logout/revocation)
  - Frequently accessed articles
  - Tag usage counts
  - Ranked feedback (TTL 5 minutes)
  - OpenAI API response cache (embeddings, analyses)
- Cache invalidation on writes via pub/sub
- Cache warming for popular content

**Vector Search Optimization**:
- HNSW index for approximate nearest neighbor search
- Limit similarity searches to same article (smaller search space)
- Cache recent similarity checks
- Batch embedding generation when possible

### Frontend Performance

**Asset Optimization**:
- Minified CSS and JavaScript
- Compressed images (WebP with fallbacks)
- Lazy loading for images below fold
- Code splitting for large applications

**Rendering Strategy**:
- Server-side rendering for SEO and initial load
- Client-side hydration for interactivity
- Incremental rendering for long articles
- Virtual scrolling for large lists

**Network Optimization**:
- HTTP/2 for multiplexing
- Resource hints (preload, prefetch)
- Service worker caching
- Brotli compression
- WebSocket connection reuse (no reconnection overhead)

**Real-time Updates**:
- Optimistic UI updates (don't wait for server confirmation)
- Debounce rapid ranking clicks
- Batch multiple ranking actions if user clicks quickly
- Efficient DOM updates (only changed elements)

### WebSocket Performance

**Connection Management**:
- Connection pooling on server side
- Sticky sessions for load balancing (same user → same server)
- Graceful connection draining during deployments
- Keep-alive pings to maintain connection
- Automatic cleanup of stale connections

**Message Optimization**:
- Binary protocol consideration for large payloads (future)
- Message compression (permessage-deflate)
- Batch events when possible (e.g., multiple ranking updates)
- Throttle event broadcasts to prevent flooding

**Scalability**:
- Redis pub/sub for cross-server event broadcasting
- WebSocket connections distributed across servers
- Session affinity via load balancer
- Horizontal scaling of WebSocket servers

---

## Scalability Considerations

### Horizontal Scaling

**Stateless Application Servers**:
- Session state in Redis, not server memory
- Any server can handle any request
- Load balancer distributes traffic
- Auto-scaling based on CPU/memory metrics

**Database Scaling**:
- Read replicas for read-heavy workload
- Connection pooling with PgBouncer
- Prepared statements for query plan caching
- Partitioning for large tables (by date or author)

**CDN Integration**:
- Static assets served via CDN
- User subdomain routing via CDN
- Edge caching for public content
- Geographic distribution

### Future Growth Patterns

**Multi-region Support**:
- Database replication across regions
- Closest region serves content
- Eventual consistency acceptable for rankings

**Storage Scaling**:
- Object storage for media uploads (future)
- Separate storage service from application
- Content delivery optimized per region

---

## Monitoring and Maintenance

### Application Monitoring

**Metrics to Track**:
- Request rate and response times (REST)
- WebSocket connection count (active, total)
- MCP tool call rate and latency by tool name
- Error rates by endpoint/tool
- Database query performance
- Cache hit rates
- User registration and verification success rates
- Feedback submission and ranking activity
- OpenAI API call volume and latency
- OpenAI API cost tracking (daily/monthly)
- OpenAI API error rates
- WebSocket connection failures and reconnection events
- Message queue depth during disconnections

**Alerting Thresholds**:
- Error rate exceeds 1% (REST or MCP)
- Response time P95 exceeds 500ms
- WebSocket connections exceed server capacity
- Database connection pool exhausted
- Email service failures
- Disk space below 20%
- OpenAI API daily budget 80% consumed
- OpenAI API error rate exceeds 5%
- WebSocket reconnection rate exceeds 10%

**Logging Strategy**:
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Request ID for tracing (REST and WebSocket)
- No sensitive data in logs (passwords, tokens, full feedback content)
- WebSocket lifecycle events (connect, disconnect, error)
- MCP tool calls with arguments (sanitized)
- OpenAI API calls with token counts and costs

### Database Maintenance

**Regular Tasks**:
- VACUUM to reclaim storage
- ANALYZE to update statistics
- Index maintenance and rebuilding
- Backup verification
- Archive old version records

**Backup Strategy**:
- Daily full backups
- Point-in-time recovery capability
- Backup retention: 30 days
- Offsite backup storage
- Regular restore testing

---

## User Interface Specifications

**Single Page Application (SPA) Architecture** - Three main views with persistent header and smooth content transitions.

### Landing Page Layout (Public - knowledgefoyer.com)

**Persistent Header**:
```
┌─────────────────────────────────────────────────┐
│ [Knowledge Foyer] (navy #1e293b)   [Login] [Register] │
│ White text on navy background     Electric blue buttons │
└─────────────────────────────────────────────────┘
```

**Main Content - Exposition Discovery**:
- **Hero Section**: Brief platform description and value proposition
- **Browse Expositions** (No authentication required):
  ```
  ┌─────────────────────────────────────────────────┐
  │ Discover Curated Collections                    │
  │                                                 │
  │ ┌───────────────┐ ┌───────────────┐ ┌─────────── │
  │ │ Tech Ethics   │ │ Climate Tech  │ │ Remote Work │
  │ │ 12 articles   │ │ 8 articles    │ │ 15 articles │
  │ │ by @alice     │ │ by @bob       │ │ by @carol   │
  │ │ [View] button │ │ [View] button │ │ [View] btn  │
  │ └───────────────┘ └───────────────┘ └─────────── │
  └─────────────────────────────────────────────────┘
  ```
- **Exposition Cards**:
  - Title and creator
  - Article count and criteria preview
  - Clean card design with light shadows
  - Electric blue "View" buttons
  - Hover effects with light blue (#60a5fa) highlights

**Footer**: Simple links (About, Terms, Privacy, Contact)

### Exposition View Layout (Public - No Login Required)

**Contextual Header**:
```
┌─────────────────────────────────────────────────┐
│ [← Expositions] [Knowledge Foyer]  [Login] [Register] │
│ Back button     Navy brand         Electric blue buttons │
└─────────────────────────────────────────────────┘
```

**Exposition Content**:
- **Exposition Header**:
  - Title (large, navy text)
  - Creator byline ("by @username")
  - Description paragraph
  - Criteria display: "Articles tagged #ethics, #AI by @alice, @bob"
- **Article Collection**:
  ```
  ┌─────────────────────────────────────────────────┐
  │ 📄 AI Bias in Hiring Systems                    │
  │    by @alice • 3 days ago • #ethics #AI        │
  │    Brief excerpt from the article...            │
  │                                                 │
  │ 📄 Privacy in the Age of Machine Learning      │
  │    by @bob • 1 week ago • #privacy #AI         │
  │    Brief excerpt from the article...            │
  └─────────────────────────────────────────────────┘
  ```
- **Article List Items**:
  - Clean, readable typography
  - Click to expand/read article content inline
  - Gray (#64748b) metadata text
  - Light card backgrounds (#f8fafc)

### Registration Layout

**Simplified Header**: [Knowledge Foyer] [← Back to Login]

**Registration Form**:
- Clean, centered form with blue accents
- Username, email, password fields
- Electric blue submit button
- Link back to login option
- Email verification flow after registration

### Work Page Layout (Authenticated - Workspace)

**Work-Focused Header**:
```
┌─────────────────────────────────────────────────┐
│ [📝 My Articles] [📑 My Expositions] [📊 Analytics] [@username ▼] │
│ Navigation tabs (navy)                          User dropdown  │
└─────────────────────────────────────────────────┘
```

**Dashboard View - Article Management**:
```
┌─────────────────────────────────────────────────┐
│ My Articles                    [+ New Article]  │
│                                Electric blue btn │
│ ┌─────────────────────────────────────────────┐ │
│ │ Article Title          Last Edit   Pro  Con │ │
│ │ AI Ethics Framework    2 days ago   12   3  │ │
│ │ Remote Work Guide      1 week ago    8   7  │ │  ← High con count
│ │ Climate Analysis       3 weeks ago   5   1  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Dashboard Features**:
- **Quick Actions**: Create new article, filter by status, sort by metrics
- **Article Metrics**: Last edit date, pro/con feedback counts
- **Visual Priority**: High con counts highlighted in orange to show attention needed
- **Status Indicators**: Draft, Under Review, Published states
- **Click Behavior**: Select article to enter detailed view/edit mode

**Article Detail/Edit View - Three Column Layout**:

**Wide Screen (Desktop 1200px+)**:
```
┌─────────┬─────────────────────┬─────────┐
│  PROS   │       ARTICLE       │  CONS   │
│ (12) ▲  │                     │ (3) ▲   │
│         │                     │         │
│ ✓ Clear │ # Article Title     │ ✗ Needs │
│   writing│                     │   examples│
│   style │ Article content in  │         │
│         │ markdown editor...  │ ✗ Too   │
│ ✓ Well  │                     │   technical│
│   sourced│ [Edit Mode Toggle]  │   jargon│
│   data  │ [Push for Review]   │         │
│         │                     │ ✗ Minor │
│ ✓ Good  │                     │   typos │
│   flow  │                     │         │
└─────────┴─────────────────────┴─────────┘
```

**Narrow Screen (Mobile/Tablet)**:
```
┌─────────────────────────────────┐
│           ARTICLE               │
│ # Article Title                 │
│ Article content...              │
│                                 │
│ [Edit Mode] [Push for Review]   │
├─────────────────────────────────┤
│ PROS (12) ▼                     │
│ ✓ Clear writing style           │
│ ✓ Well sourced data             │
│ ✓ Good flow                     │
├─────────────────────────────────┤
│ CONS (3) ▼                      │
│ ✗ Needs examples                │
│ ✗ Too technical jargon          │
│ ✗ Minor typos                   │
└─────────────────────────────────┘
```

### Pro/Con Feedback System Design

**Feedback Structure**:
- **Pro Feedback** (Emerald #10b981): "Keep/amplify this aspect"
- **Con Feedback** (Orange #f59e0b): "Address/improve this aspect" (not negative/critical)
- **Clear Terminology**: Avoids emotional "positive/negative" language
- **Actionable Focus**: Pros = maintain, Cons = improve

**Feedback Interaction**:
```
┌─────────────────────────────────┐
│ ✓ Clear writing style       ⬆12│ ← Pro with upvote count
│   "Easy to follow logic"        │
│   👤 @reviewer • 2 days ago     │
│                                 │
│ ✗ Needs concrete examples   ⬆5 │ ← Con with upvote count
│   "Abstract concepts need       │
│    real-world illustrations"    │
│   👤 @expert • 1 day ago        │
│                                 │
│ [+ Add Pro] [+ Add Con]         │
└─────────────────────────────────┘
```

**AI Re-evaluation Workflow**:
1. **Author edits article** → clicks "Push for Review"
2. **AI analyzes changes** → determines which existing pros/cons still apply
3. **Filtered feedback** → outdated feedback marked as "may no longer apply"
4. **Community re-votes** → users confirm relevance of existing feedback
5. **Fresh feedback** → new pros/cons can be added for updated content

**Edit Mode Features**:
- **Side-by-side editing**: Markdown editor with live preview
- **Feedback integration**: Click con → highlight relevant text section
- **Version control**: "Address this feedback" links to track improvements
- **Draft management**: Auto-save drafts, publish when ready

### Responsive Behavior

**Breakpoint Strategy**:
- **Mobile (320-768px)**: Stacked layout, collapsible pro/con sections
- **Tablet (768-1024px)**: Hybrid layout, article focus with sidebar feedback
- **Desktop (1024px+)**: Full three-column layout for optimal workflow

**Progressive Enhancement**:
- **Base layer**: Server-rendered HTML for exposition browsing
- **Enhanced layer**: JavaScript SPA for authenticated work experience
- **Advanced layer**: Real-time updates via WebSocket MCP protocol
  - Auto-updates as new matching articles published
  - Sort options: recent, popular, alphabetical

**Sidebar**:
- Criteria breakdown
  - Authors section
  - Tags section
- Related expositions (by similar criteria)
- Create your own exposition (if logged in)

**Edit Mode** (for author):
- Add Author input with autocomplete
- Add Tag input with autocomplete
- Remove buttons next to each criterion
- Publish/Unpublish toggle
- Delete exposition button

### Author Subdomain Updates

**Author Profile Header**: Same as profile page

**Navigation Tabs**:
- Published Articles
- Custom Expositions (public ones)
- Message feed (recent messages from this author)

**Article List**: Existing

**Custom Expositions Section**:
- Cards for each public exposition
- Title, description preview
- Click to view full exposition page

### Article View Layout

**Article Header**:
- Title
- Author name (links to author subdomain)
- Publication date, last updated date
- Tags (clickable to filter)
- Version indicator (current version X)

**Article Content**:
- Markdown-rendered content
- Table of contents for long articles (auto-generated)
- Syntax highlighting for code blocks
- Responsive images

**Feedback Section**:
- Add Feedback button (authors only)
- Two columns for ranked feedback:
  - Left: Most Useful Positive Feedback
  - Right: Most Useful Negative Feedback
- Each shows top N items (e.g., 10), scrollable
- Below: "Help Curate (X remaining)" section
  - Single unranked feedback item
  - Three buttons in random order
  - Progress indicator

**Version History Panel** (collapsible):
- List of versions with dates
- Change summaries
- Which feedback was addressed per version
- Link to view specific version

### Author Subdomain Layout

**Author Profile Header**:
- Display name
- Bio (if provided)
- Join date
- Contribution stats (articles published, feedback provided, improvements contributed to)

**Article List**:
- Published articles
- Sorted by recency or custom order
- Tag filter specific to this author
- Article titles, excerpts, publication dates

**Tag Cloud**:
- Tags used by this author
- Size by frequency
- Click to filter articles

### Responsive Behavior

**Mobile View**:
- Single column layout
- Hamburger menu for navigation
- Ranked feedback columns stack vertically
- Touch-friendly buttons
- Bottom navigation for key actions

**Tablet View**:
- Two-column layout where appropriate
- Sidebar becomes collapsible
- Feedback columns side-by-side if space permits

**Desktop View**:
- Full multi-column layout
- Persistent sidebar
- Wider content area
- Hover interactions

---

## Dependencies

### Backend Dependencies (Node.js)

**Core Framework**:
- `express` - Web server and routing (well-established, minimal)
- `ws` - WebSocket server implementation (standard library)

**MCP Implementation**:
- `@modelcontextprotocol/sdk` - Official MCP SDK for Node.js

**Database**:
- `pg` - PostgreSQL client (official Node.js driver)
- `pgvector` - Vector extension utilities for Node.js

**Authentication**:
- `jsonwebtoken` - JWT creation and validation
- `bcrypt` - Password hashing

**OpenAI Integration**:
- `openai` - Official OpenAI API client

**Email**:
- `nodemailer` - Email sending (widely used, battle-tested)

**Utilities**:
- `dotenv` - Environment variable management (development only)
- `validator` - Input validation (email, URLs, etc.)

**Development**:
- `nodemon` - Auto-restart during development

### Frontend Dependencies

**Minimal approach - prefer vanilla JavaScript**:
- No frontend framework (React, Vue, etc.)
- No build tools required for MVP
- Optional for later phases: bundler if code splitting needed

**Potential additions for advanced features**:
- `marked` - Markdown parsing (lightweight, well-maintained)
- Service Worker tooling only if complexity warrants

### Database Extensions

**PostgreSQL Extensions**:
- `pgvector` - Vector similarity search for embeddings
- `uuid-ossp` - UUID generation (built-in to modern PostgreSQL)
- `pg_trgm` - Trigram matching for fuzzy search (optional, for tag autocomplete)

### Infrastructure Dependencies

**Process Management**:
- `pm2` - Production process manager (keeps app running, handles restarts)

**Caching** (optional for MVP, recommended for scaling):
- `redis` - In-memory cache and pub/sub for WebSocket events
- `ioredis` - Redis client (if using Redis)

**Monitoring** (optional for MVP):
- `prom-client` - Prometheus metrics exposure

---

## Design System

### Color Palette

**Contemporary Blue Theme - Bold & Stylish**

**Foundation Colors**:
- **Background**: Clean white `#ffffff` (main application background)
- **Surface**: Light gray surface `#f8fafc` (cards and elevated content)
- **Text Primary**: Dark slate `#1e293b` (primary text, high contrast)
- **Text Secondary**: Muted gray `#64748b` (secondary text, metadata)

**Brand Colors**:
- **Deep Navy** (Primary): `#1e293b`
  - Use for: header background, primary text, navigation elements
  - Variations: lighter `#334155` for hover, darker `#0f172a` for active
- **Electric Blue** (Accent): `#3b82f6`
  - Use for: primary buttons, links, call-to-action elements, active states
  - Variations: lighter `#60a5fa` for hover, darker `#2563eb` for active
- **Cyan Blue** (Secondary): `#06b6d4`
  - Use for: secondary buttons, badges, highlights, progress indicators
  - Variations: lighter `#22d3ee` for hover, darker `#0891b2` for active

**Feedback System Colors**:
- **Pro Indicators**: Emerald green `#10b981`
  - Background tint: `#ecfdf5` (very light green)
  - Use for: positive feedback, success states, "keep this" indicators
- **Con Indicators**: Orange `#f59e0b`
  - Background tint: `#fef3c7` (very light orange)
  - Use for: improvement needed feedback, "address this" indicators (not negative/red)
- **Neutral**: Blue gray `#6b7280`
  - Use for: neutral states, pending feedback, inactive elements

**Status & Semantic Colors**:
- **Success**: `#10b981` (confirmations, completed states)
- **Warning**: `#f59e0b` (caution, attention needed)
- **Error**: `#ef4444` (errors, destructive actions)
- **Info**: `#3b82f6` (informational messages, using brand blue)

**Neutral Palette** (Blue-tinted grays for contemporary feel):
- **Gray-50**: `#f8fafc` (lightest backgrounds, card surfaces)
- **Gray-100**: `#f1f5f9` (subtle backgrounds, hover states)
- **Gray-200**: `#e2e8f0` (borders, dividers)
- **Gray-300**: `#cbd5e1` (inactive elements, disabled states)
- **Gray-400**: `#94a3b8` (placeholder text)
- **Gray-500**: `#64748b` (secondary text, labels)
- **Gray-600**: `#475569` (tertiary text, icons)
- **Gray-700**: `#334155` (emphasis text)
- **Gray-900**: `#1e293b` (primary text, headers)

**Code Block Theme** (dark, complements blue theme):
- **Background**: `#0f172a` (deep navy, matches our dark primary)
- **Text**: `#f8fafc` (light gray)
- **Syntax Highlighting**:
  - Keywords: `#60a5fa` (light blue, matches our accent)
  - Strings: `#22d3ee` (cyan, matches our secondary)
  - Comments: `#64748b` (muted gray)
  - Functions: `#10b981` (emerald, matches our success color)
  - Variables: `#f59e0b` (orange, matches our warning color)

### Typography

**Font Families**:
```
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--font-serif: 'Lora', Georgia, 'Times New Roman', serif
--font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace
```

Fallback to Georgia for serif if web font loading fails (acceptable alternative).

**Font Weights**:
- Regular: 400 (body text)
- Medium: 500 (UI elements, emphasized text)
- Semibold: 600 (headings, buttons)

**Type Scale** (base 16px on desktop, 14px on mobile):
```
--text-xs: 12px / 0.75rem
--text-sm: 14px / 0.875rem
--text-base: 16px / 1rem
--text-lg: 18px / 1.125rem
--text-xl: 20px / 1.25rem
--text-2xl: 24px / 1.5rem
--text-3xl: 30px / 1.875rem
--text-4xl: 36px / 2.25rem
--text-5xl: 48px / 3rem
```

**Line Heights**:
- **Body text**: 1.6-1.7 (generous for long reading)
- **UI elements**: 1.5 (tighter for buttons, labels)
- **Headings**: 1.2-1.3 (tight, impactful)
- **Code**: 1.5 (monospace needs space)
- **Mobile body**: 1.7-1.8 (extra generous)

**Measure (Line Length)**:
- **Articles**: 60-75 characters (650-700px max width)
- **Feed**: ~80 characters (800px max width)
- **Directory**: Flexible (1000px+)

**Heading Hierarchy**:
```
H1: text-4xl, font-sans, weight-600, deep navy (#1e293b)
H2: text-3xl, font-sans, weight-600, dark slate (#1e293b)
H3: text-2xl, font-sans, weight-600, dark slate (#1e293b)
H4: text-xl, font-sans, weight-500, dark slate (#1e293b)
H5: text-lg, font-sans, weight-500, gray-700 (#334155)
H6: text-base, font-sans, weight-500, gray-600 (#475569)

Body: text-base, font-serif, weight-400, dark slate (#1e293b)
UI Text: text-sm or text-base, font-sans, weight-400, gray-500 (#64748b)
Code: text-sm, font-mono, weight-400, gray-600 (#475569)
```

### Spacing System

**Base Unit**: 4px

**Spacing Scale**:
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
--space-24: 96px
```

**Usage Guidelines**:
- Tight spacing (4-8px): Related elements, list items
- Medium spacing (16-24px): Section separation, card padding
- Loose spacing (32-64px): Major section breaks, page margins
- Extra loose (80px+): Hero sections, major visual breaks

**Layout Margins**:
- Mobile: 16px side margins
- Tablet: 24px side margins
- Desktop: 32-48px side margins or percentage-based

### Components

**Contemporary Blue Button System**:

Primary (call-to-action):
```
background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)
color: white
padding: 12px 24px
border-radius: 8px
border: none
font: Inter, weight-500, text-base
box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2)
hover: background linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)
active: transform scale(0.98), background #2563eb
focus: box-shadow 0 0 0 3px rgba(59, 130, 246, 0.3)
```

Secondary (standard actions):
```
background: transparent
border: 2px solid #3b82f6
color: #3b82f6 (electric blue)
padding: 10px 22px (account for border)
border-radius: 8px
font: Inter, weight-500, text-base
hover: background #3b82f6, color white
active: background #2563eb, border-color #2563eb
focus: box-shadow 0 0 0 3px rgba(59, 130, 246, 0.3)
```

Tertiary (subtle actions):
```
background: transparent
color: #64748b (gray-500)
padding: 8px 16px
border: none
border-radius: 6px
font: Inter, weight-400, text-sm
hover: background #f1f5f9 (gray-100)
active: background #e2e8f0 (gray-200)
```

Feedback Action Buttons:
```
Pro Button: background #10b981, hover #059669
Con Button: background #f59e0b, hover #d97706
Vote Button: background #64748b, hover #475569
```

Destructive:
```
background: #ef4444 (error red)
color: white
hover: background #dc2626
Same styling pattern as primary
```

**Touch Targets**:
- Minimum 48px × 48px on mobile
- Minimum 44px × 44px on tablet
- 40px × 40px acceptable on desktop

**Cards**:
```
background: white
border: 1px solid #e2e8f0 (gray-200)
border-radius: 12px
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)
padding: 16px to 24px
hover: box-shadow 0 4px 12px rgba(0, 0, 0, 0.15)
transition: all 200ms ease
```

**Input Fields**:
```
border: 1px solid #e2e8f0 (gray-200)
border-radius: 8px
padding: 12px 16px
font: Inter, weight-400, text-base
color: #1e293b (dark slate)
background: white
placeholder-color: #64748b (gray-500)

focus:
  border-color: #3b82f6 (electric blue)
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1)
  outline: none

error:
  border-color: #ef4444 (error red)
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1)
```

**Navigation Patterns (SPA)**:
```
Header Navigation:
- Persistent across all views
- Context-aware content (public vs authenticated)
- Smooth transitions between states
- Active state indicators in electric blue

Content Transitions:
- Fade between major view changes (landing → work)
- Slide transitions for related content (article list → article detail)
- Instant updates for real-time content (feedback votes)
- Loading states with blue progress indicators
```
Padding: 24px
Shadow: 0 1px 3px rgba(0,0,0,0.1) (subtle)
Hover: 0 4px 6px rgba(0,0,0,0.1) (slightly elevated)
```

**Forms**:

Input fields:
```
Background: white
Border: 1px solid gray-300
Border-radius: 6px
Padding: 10px 12px
Focus: border deep-green, subtle shadow
Error: border error-color
Font: font-sans, text-base
```

Labels:
```
Font: font-sans, text-sm, weight-500
Color: gray-700
Margin-bottom: 6px
```

**Tags/Pills**:
```
Background: deep-green or outlined
Text: white (filled) or deep-green (outlined)
Padding: 4px 12px
Border-radius: 16px (fully rounded)
Font: font-sans, text-xs or text-sm, weight-500
Clickable: add hover state (lighter green)
```

**Dividers**:
```
Height: 1px
Color: gray-200
Margin: 24px 0 (or space-6)
```

**Tooltips** (if needed):
```
Background: gray-900
Text: white
Padding: 8px 12px
Border-radius: 4px
Font: font-sans, text-sm
Shadow: 0 2px 8px rgba(0,0,0,0.15)
```

**Icons**:
- Icon set: **Lucide** or **Feather Icons** (clean, minimal line icons)
- Size: 16px (small), 20px (medium), 24px (large)
- Stroke width: 2px (consistent)
- Color: inherit from parent or gray-600 for inactive

### Interactive States

**Contemporary Blue Theme Interactions**:

**Hover**:
- Buttons: gradient shift to lighter blues (#60a5fa → #3b82f6)
- Links: electric blue (#3b82f6) with subtle underline
- Cards: elevated shadow (0 4px 12px rgba(0,0,0,0.15))
- Icons: color change to electric blue (#3b82f6)
- Pro/Con items: subtle background highlight in respective colors
- Article rows: light blue background tint (#f0f9ff)

**Focus** (Enhanced keyboard navigation):
- Focus ring: 0 0 0 3px rgba(59, 130, 246, 0.3) (blue with transparency)
- Offset: none (modern approach)
- Border-radius: matches element + 2px
- Never remove focus indicators (accessibility)
- Skip-to-content: blue background with white text

**Active/Pressed**:
- Buttons: transform scale(0.98) + darker blue (#2563eb)
- Links: visited state in muted blue (#475569)
- Cards: subtle scale (0.995) + reduced shadow

**Disabled**:
- Opacity: 0.6 (improved from 0.5 for better visibility)
- Cursor: not-allowed
- Colors shift to grayed blues (#94a3b8)
- No hover or focus states
- No hover effects

**Loading**:
- Skeleton screens: subtle pulsing animation
- Background: gray-100 to gray-200 pulse
- Duration: 1.5s ease-in-out infinite

### Animations

**Transitions**:
```
Default: 150ms ease-in-out (color, background, border)
Movement: 200ms ease-out (transforms, positions)
Complex: 300ms ease-in-out (multi-property animations)
```

**Page Transitions**:
- Fade in: 200ms
- No sliding or elaborate animations
- Maintain scroll position where appropriate

**Real-time Updates**:
- New items slide in from top: 300ms ease-out
- Removed items fade out: 200ms
- Position changes: 250ms ease-in-out

**Micro-interactions**:
- Button press: slight scale or shadow change
- Toast notifications: slide up from bottom-right, auto-dismiss after 5s
- Success checkmarks: subtle bounce

**Performance**:
- Use CSS transforms (not position changes)
- Prefer opacity over visibility
- Hardware acceleration where beneficial
- Reduce motion for accessibility preferences (prefers-reduced-motion)

### Shadows

**Elevation Levels**:
```
Level 1 (subtle): 0 1px 3px rgba(0,0,0,0.1)
Level 2 (raised): 0 4px 6px rgba(0,0,0,0.1)
Level 3 (floating): 0 10px 15px rgba(0,0,0,0.1)
Level 4 (modal): 0 20px 25px rgba(0,0,0,0.15)
```

**Usage**:
- Cards: Level 1 default, Level 2 on hover
- Dropdowns: Level 3
- Modals/dialogs: Level 4
- Avoid overuse (flat design preferred)

### Accessibility

**Contrast Ratios** (WCAG):
- Large text (18px+): Minimum 3:1, target 4.5:1
- Body text: Minimum 4.5:1, target 7:1 (AAA)
- UI components: Minimum 3:1

**Alt Text Requirements**:
- All meaningful images: descriptive alt text
- Decorative images: `alt=""` (empty, so screen readers skip)
- User avatars: `alt="[Username]'s profile photo"` or `alt="[Username]"`
- Article images: `alt="[Description of image content]"`
- Logo: `alt="Knowledge Foyer home"`
- Icons with meaning: include alt or aria-label
- Icons purely decorative: aria-hidden="true"

**Note on Title Attribute**:
- Title attribute (hover tooltips) is NOT a replacement for alt text
- Title only works on desktop hover, not on mobile
- NOT read by most screen readers by default
- Use title as supplementary information only, never for critical content

**Semantic HTML**:
- Proper heading hierarchy (h1 → h2 → h3, no skipping)
- `<main>`, `<nav>`, `<article>`, `<aside>`, `<footer>` elements
- `<button>` for actions, `<a>` for navigation
- Form labels properly associated with inputs
- ARIA labels where semantic HTML insufficient

**Keyboard Navigation**:
- All interactive elements keyboard accessible
- Logical tab order
- Skip to main content link
- Focus indicators always visible
- Escape key closes modals
- Arrow keys for list navigation (where appropriate)

**Screen Reader Considerations**:
- Announce dynamic content changes (ARIA live regions)
- Label all form fields
- Provide text alternatives for visual content
- Status messages announced appropriately

**Reduced Motion**:
- Respect `prefers-reduced-motion` media query
- Disable animations for users who request it
- Instant transitions instead of animated ones

### Responsive Breakpoints

```
Mobile: < 768px
Tablet: 768px - 1024px
Desktop: > 1024px
Wide: > 1440px (max-width constraints)
```

**Mobile-First Approach**:
- Start with mobile layout
- Progressively enhance for larger screens
- Test on actual devices, not just browser resize

**Touch Targets** (Mobile):
- Minimum 48px × 48px
- Adequate spacing between (8px minimum)
- Larger text for readability (14px base)

**Responsive Typography**:
```
Mobile base: 14px
Tablet base: 15px
Desktop base: 16px

Scale headings proportionally
Increase line-height on mobile (1.7-1.8)
```

### Code Blocks

**Styling**:
```
Background: #1e1e1e (dark)
Border-radius: 8px
Padding: 16px
Font: font-mono, text-sm
Line-height: 1.5
Overflow-x: auto
```

**Features**:
- Syntax highlighting (using library like Prism.js or highlight.js)
- Line numbers: optional, left gutter
- Copy button: top-right corner, appears on hover
- Language label: top-left corner (subtle)
- Horizontal scroll for long lines (don't wrap)

**Inline Code**:
```
Background: gray-100
Color: gray-900
Padding: 2px 6px
Border-radius: 3px
Font: font-mono, text-sm (slightly smaller than body)
```

### Feedback Section Styling

**Column Layout**:
- Two columns on desktop (50/50 split)
- Stack vertically on mobile/tablet
- Clear labels: "Most Useful Positive Feedback" / "Most Useful Negative Feedback"
- Subtle background tints optional:
  - Positive column: very light green (#f0f7f0)
  - Negative column: very light amber (#fef9ec)

**Feedback Items**:
```
Background: white
Border: 1px solid gray-200
Border-radius: 6px
Padding: 16px
Margin-bottom: 12px
Shadow: none (or level 1 subtle)
```

**Vote Counts**:
- Display: "👍 47" or icon + number
- Font: font-sans, text-sm, gray-600
- Position: below or inline with feedback text

**Unranked Section**:
- Clear separator (divider line)
- Label: "Help Curate (X remaining)"
- Single item displayed
- Buttons in random order each time
- Progress indicator visible

### Additional Design Guidelines

**Content First**:
- Design never overshadows content
- Generous whitespace around text
- No distracting animations in reading areas
- Clear visual hierarchy

**Performance**:
- Optimize font loading (subset, preload critical fonts)
- Lazy load images below fold
- Minimize CSS/JS bundle size
- Critical CSS inline for first paint

**Consistency**:
- Use spacing system religiously
- Stick to color palette (no one-off colors)
- Reuse components (don't reinvent)
- Document any exceptions

**Progressive Enhancement**:
- Works without JavaScript (initial load)
- Enhanced with JavaScript (interactions)
- Enhanced with WebSocket (real-time)
- Graceful degradation at each level

---

## Implementation Phases

### Phase 1: Core Platform (MVP)
- User registration and email verification (REST)
- Basic authentication (JWT for both REST and WebSocket)
- REST endpoints for page serving and OAuth
- WebSocket server with MCP implementation
- Article creation and publishing (via MCP)
- Tag system (via MCP)
- Landing page with article directory (REST HTML + MCP data)
- Author subdomains (REST HTML + MCP data)
- Basic responsive design
- PostgreSQL setup with basic tables

### Phase 2: Feedback System
- Feedback submission (via MCP `submit_feedback` tool)
- Ranking interface (via MCP `rank_feedback` tool)
- Unranked queue display (MCP resource + events)
- Vote counting and ranking display (real-time via MCP events)
- Ignore functionality
- Feedback ranking denormalization

### Phase 3: Version Control
- Article versioning (via MCP `update_article` tool)
- Version history view (MCP `get_version_history` resource)
- Change summaries
- Basic addressed feedback detection (manual marking initially)
- Version comparison UI

### Phase 4: Social Features
- Follow/unfollow system (MCP tools)
- Message posting and feed (via MCP)
- Automatic article/revision announcements
- Feed timeline with real-time updates
- Follower/following lists
- Follow notifications

### Phase 5: Custom Exposition Pages
- Exposition creation and editing (via MCP)
- Criteria management (add/remove authors and tags)
- Article aggregation with OR logic
- Exposition page rendering
- Discovery and browsing interface

### Phase 6: OpenAI Integration
- OpenAI API client setup with error handling
- pgvector extension installation
- Embedding generation for feedback
- Duplicate feedback detection (`check_feedback_similarity` MCP tool)
- Automated addressed feedback analysis (via GPT-4)
- Similarity scoring and threshold configuration
- Cost controls and budget limits

### Phase 7: Real-time Features Enhancement
- MCP event broadcasting (ranking updates, feedback addressed, new messages)
- Live UI updates via WebSocket events
- Optimistic UI updates
- Connection state management
- Reconnection handling with message queue

### Phase 8: PWA and Polish
- Service worker implementation
- Offline capability for reading
- Background sync for queued actions
- Push notifications for messages and feedback (optional)
- Performance optimization
- Enhanced search (full-text + filters)
- Mobile-first responsive refinements

### Phase 9: Analytics and Credit
- Feedback resolution tracking
- Contributor credit system
- Author analytics dashboard
- Community statistics
- Profile contribution metrics
- Version history with credit display
- Message engagement metrics

### Phase 10: OAuth and Extended Social
- Google sign-in integration (REST OAuth flow)
- Profile enhancement
- Message threading/conversations (future)
- Private messaging between authors (future)
- Future: GitHub, LinkedIn OAuth

---

## API Overview

### REST Endpoints (HTTP)

**Public Content** (no authentication required):
- GET / - Landing page HTML
- GET /:username - Author subdomain HTML
- GET /articles/:slug - Article page HTML
- GET /tags/:tag_name - Tag exposition page HTML
- GET /feed - Public feed page HTML (login required to post)
- GET /:username/expositions/:slug - Custom exposition page HTML
- GET /api/articles - Article list JSON (for feeds/SEO)
- GET /api/articles/:article_id - Article JSON
- GET /api/users/:username - Public profile JSON
- GET /api/tags - Tag list JSON
- GET /api/tags/:tag_name/articles - Articles with tag JSON
- GET /api/messages - Public message feed JSON
- GET /api/messages/:username - Messages by user JSON
- GET /api/expositions/:exposition_id - Exposition data JSON

**Authentication** (REST-based flows):
- POST /api/auth/register - User registration
- POST /api/auth/login - Login (returns JWT + refresh token)
- POST /api/auth/logout - Invalidate refresh token
- POST /api/auth/refresh - Get new access token
- GET /api/auth/verify-email?token=... - Email verification
- POST /api/auth/resend-verification - Resend verification email
- POST /api/auth/forgot-password - Request password reset
- POST /api/auth/reset-password - Complete password reset
- GET /api/auth/google - Initiate Google OAuth flow
- GET /api/auth/google/callback - OAuth callback handler

**Static Assets**:
- GET /css/* - Stylesheets
- GET /js/* - JavaScript bundles
- GET /images/* - Images and icons
- GET /manifest.json - PWA manifest
- GET /sw.js - Service worker

**Health and Monitoring**:
- GET /health - Health check endpoint
- GET /metrics - Prometheus metrics (authenticated)

### MCP Tools (WebSocket)

All MCP tools require authenticated WebSocket connection with valid JWT.

**Article Management**:
- `create_article`
  - Arguments: title, content, tags[], content_type, slug (optional)
  - Returns: article_id, url, created_at
  
- `update_article`
  - Arguments: article_id, content, change_summary, tags[] (optional)
  - Returns: new_version_number, updated_at, addressed_feedback[]
  
- `delete_article`
  - Arguments: article_id
  - Returns: success boolean
  
- `publish_article`
  - Arguments: article_id
  - Returns: success, published_url
  
- `unpublish_article`
  - Arguments: article_id
  - Returns: success

**Feedback Operations**:
- `submit_feedback`
  - Arguments: article_id, content
  - Returns: feedback_id, similarity_check (if duplicates found)
  
- `confirm_feedback_submission`
  - Arguments: feedback_id, confirmed (boolean)
  - Returns: success, feedback_id
  
- `rank_feedback`
  - Arguments: feedback_id, positive_utility (boolean), negative_utility (boolean), ignored (boolean)
  - Returns: success, new_counts {positive, negative, ignore}
  
- `delete_feedback`
  - Arguments: feedback_id (must own feedback)
  - Returns: success

**Data Queries**:
- `get_article`
  - Arguments: article_id or slug + author_username
  - Returns: full article object with metadata
  
- `get_article_feedback`
  - Arguments: article_id
  - Returns: {ranked_positive[], ranked_negative[], metadata}
  
- `get_unranked_queue`
  - Arguments: article_id (optional, for specific article)
  - Returns: {feedback_item, total_remaining}
  
- `get_version_history`
  - Arguments: article_id
  - Returns: versions[] with change_summary and addressed_feedback
  
- `get_version_content`
  - Arguments: article_id, version_number
  - Returns: full content for that version

**Search and Discovery**:
- `search_articles`
  - Arguments: query, tags[], author, content_type, date_range, sort_by, limit, offset
  - Returns: articles[], total_count, has_more
  
- `get_popular_tags`
  - Arguments: limit (optional)
  - Returns: tags[] with usage_count
  
- `get_tag_articles`
  - Arguments: tag_name, limit, offset
  - Returns: articles[], total_count

**User Profile**:
- `update_profile`: Modify user bio and display name
- `get_profile`: Retrieve profile data
- `get_user_stats`: Author statistics
- `follow_author`: Follow another author
- `unfollow_author`: Unfollow an author
- `get_followers`: Get list of followers
- `get_following`: Get list of followed authors

**Messaging**:
- `post_message`: Create a new message (user post)
- `edit_message`: Edit existing message
- `delete_message`: Delete a message
- `get_feed`: Get messages from followed authors (timeline)
- `get_user_messages`: Get messages by specific author

**Custom Exposition Pages**:
- `create_exposition`: Create custom exposition page
- `update_exposition`: Modify exposition page details
- `add_exposition_criterion`: Add author or tag criterion
- `remove_exposition_criterion`: Remove criterion
- `get_exposition`: Retrieve exposition page with matching articles
- `delete_exposition`: Delete custom exposition page
- `publish_exposition`: Make exposition page public
- `unpublish_exposition`: Make exposition page private

**AI-Powered Tools**:
- `check_feedback_similarity`
  - Arguments: article_id, feedback_text
  - Returns: {similar_feedback[], analysis}
  
- `suggest_tags`
  - Arguments: title, content
  - Returns: suggested_tags[]
  
- `analyze_addressed_feedback`
  - Arguments: article_id, old_version, new_version
  - Returns: {addressed[], unaddressed[], confidence_scores}

**Following and Social**:
- `follow_author`
  - Arguments: username
  - Returns: success, follow_id, follower_count
  
- `unfollow_author`
  - Arguments: username
  - Returns: success
  
- `get_followers`
  - Arguments: username (optional, defaults to self), limit, offset
  - Returns: followers[], total_count
  
- `get_following`
  - Arguments: username (optional, defaults to self), limit, offset
  - Returns: following[], total_count

**Messaging**:
- `post_message`
  - Arguments: content, article_id (optional for announcements)
  - Returns: message_id, created_at
  - Note: If article_id provided, message_type auto-set based on article state
  
- `edit_message`
  - Arguments: message_id, content
  - Returns: success, edited_at
  
- `delete_message`
  - Arguments: message_id
  - Returns: success
  
- `get_feed`
  - Arguments: limit, offset, include_own (boolean)
  - Returns: messages[] (from followed authors, chronological)
  
- `get_user_messages`
  - Arguments: username, limit, offset
  - Returns: messages[] (public messages by author)

**Custom Exposition Pages**:
- `create_exposition`
  - Arguments: title, slug (optional), description
  - Returns: exposition_id, url
  
- `update_exposition`
  - Arguments: exposition_id, title, description
  - Returns: success
  
- `add_exposition_criterion`
  - Arguments: exposition_id, criterion_type (author/tag), criterion_value
  - Returns: success, criterion_id
  
- `remove_exposition_criterion`
  - Arguments: exposition_id, criterion_id
  - Returns: success
  
- `get_exposition`
  - Arguments: exposition_id or (author + slug)
  - Returns: {exposition_data, matching_articles[], criteria[]}
  
- `list_expositions`
  - Arguments: username (optional)
  - Returns: expositions[] (public ones, or all if own)
  
- `publish_exposition`
  - Arguments: exposition_id
  - Returns: success, url
  
- `unpublish_exposition`
  - Arguments: exposition_id
  - Returns: success
  
- `delete_exposition`
  - Arguments: exposition_id
  - Returns: success

### MCP Resources

Resources are accessible via the MCP resource URI scheme:

- `article://{article_id}` - Full article with metadata
- `feedback://{article_id}` - All feedback for article
- `feedback://{article_id}/ranked` - Ranked feedback only
- `feedback://{article_id}/unranked` - Unranked for current user
- `profile://{username}` - User profile data
- `tags://popular` - Popular tags list
- `tags://{tag_name}` - Articles tagged with tag
- `version://{article_id}/{version_number}` - Specific version content
- `queue://unranked` - User's complete unranked queue across all articles
- `feed://timeline` - Messages from followed authors
- `messages://{username}` - Messages by specific author
- `followers://{username}` - List of followers
- `following://{username}` - List of followed authors
- `exposition://{exposition_id}` - Custom exposition page with articles
- `exposition://{username}/{slug}` - Exposition by author and slug

### MCP Events (Server → Client)

Server can push these events to connected clients:

- `ranking_updated` - Live feedback ranking count changed
  - Data: {feedback_id, positive_count, negative_count}
  
- `feedback_addressed` - Your feedback was marked addressed
  - Data: {feedback_id, article_id, version_number}
  
- `new_feedback` - Someone added feedback to your article
  - Data: {feedback_id, article_id, preview}
  
- `article_updated` - Followed author published update
  - Data: {article_id, author_username, version_number, message_id}
  
- `new_message` - New message from followed author
  - Data: {message_id, author_username, preview, message_type}
  
- `new_follower` - Someone followed you
  - Data: {follower_username, follower_id}
  
- `article_published` - Followed author published new article
  - Data: {article_id, author_username, title, message_id}

### WebSocket Connection

**Endpoint**: wss://knowledgefoyer.com/mcp (or subdomain)

**Authentication**: 
- JWT token passed in initial handshake
- Either as query parameter: ?token=...
- Or in first message after connection

**Heartbeat**:
- Client sends ping every 30 seconds
- Server responds with pong
- Connection closed if no ping after 60 seconds

**Reconnection**:
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Preserve message queue during disconnection
- Replay queued messages on reconnection
- Server maintains session state for 5 minutes after disconnect

---

## Future Considerations

### Features Not in Initial Scope

**Custom Domains**:
- Allow authors to point their own domains to their subdomain
- CNAME verification process
- SSL certificate automation via Let's Encrypt

**Media Uploads**:
- Image hosting for articles
- File attachments for code projects
- Video embedding support

**Advanced Messaging**:
- Message threading and conversations
- Private/direct messaging between authors
- Message reactions (likes, etc.)
- Message resharing/quoting

**Advanced Social Features**:
- Notifications center (beyond real-time events)
- Mute/block functionality
- User recommendations algorithm
- Trending articles/topics

**Advanced Analytics**:
- View statistics per article
- Reader demographics
- Feedback quality metrics
- Content recommendation engine
- A/B testing framework

**Monetization Options**:
- Premium author tiers
- Custom subdomain pricing
- Sponsored expositions
- API access for third parties
- Author tip jar / support

**Content Features**:
- Article series/collections (beyond expositions)
- Collaborative authoring (co-authors)
- Article forking/remixing with attribution
- Reading lists
- Bookmarks

**Advanced Exposition Features**:
- AND logic for criteria (currently OR only)
- Complex queries: "Articles by @alice tagged #ai but NOT #philosophy"
- Scheduled/time-based criteria
- Algorithmic curation options

### Technical Debt Prevention

**Code Organization**:
- Modular structure from start
- Clear separation of concerns
- Consistent naming conventions
- Documentation alongside code

**Testing Strategy**:
- Unit tests for business logic
- Integration tests for API endpoints
- End-to-end tests for critical flows
- Test coverage targets (80%+)

**Dependency Management**:
- Lock file for reproducible builds
- Regular security updates
- Minimize dependency tree depth
- Document why each dependency exists

---

## Success Metrics

### Platform Health
- User registration conversion rate
- Email verification completion rate
- Author publication rate (articles per author)
- Reader engagement (time on site, articles viewed)
- Active daily/monthly users

### Feedback Quality
- Feedback submission rate
- Ranking participation rate
- Addressed feedback rate
- Feedback resolution accuracy (AI vs manual)
- Average rankings per feedback item

### Social Engagement
- Follow-to-follower ratio
- Message posting frequency
- Feed engagement (views, clicks)
- Article announcement reach (impressions to followers)
- Custom exposition creation rate
- Exposition page views

### Technical Performance
- Page load time (target: < 2s)
- API response time (target: < 200ms P95)
- WebSocket connection stability (target: > 95% uptime)
- Real-time event delivery latency (target: < 500ms)
- Uptime (target: 99.9%)
- Error rate (target: < 0.1%)

### Growth Metrics
- New authors per month
- New articles per month
- Active readers per month
- Tag usage diversity
- Network density (avg connections per user)
- Message virality (reshares, future feature)

### Content Quality
- Average feedback per article
- Article revision frequency
- Cross-author exposition engagement
- Tag-based discovery effectiveness

---

## Configuration and Environment Variables

### Required Environment Variables

**Database**:
- `DATABASE_URL` - PostgreSQL connection string (or separate host/port/user/password/database)
- `DATABASE_POOL_MIN` - Minimum connection pool size (default: 2)
- `DATABASE_POOL_MAX` - Maximum connection pool size (default: 10)

**Authentication**:
- `JWT_SECRET` - Secret for signing JWT tokens (generate random 256-bit key)
- `JWT_ACCESS_EXPIRY` - Access token expiration (default: "15m")
- `JWT_REFRESH_EXPIRY` - Refresh token expiration (default: "7d")

**Email Service**:
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (587 for TLS, 465 for SSL)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `EMAIL_FROM` - From address for system emails
- `VERIFICATION_TOKEN_EXPIRY` - Token expiration in hours (default: 24)

**OpenAI API**:
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_EMBEDDING_MODEL` - Model for embeddings (default: "text-embedding-3-small")
- `OPENAI_COMPLETION_MODEL` - Model for analysis (default: "gpt-4")
- `OPENAI_MAX_TOKENS` - Max tokens per completion (default: 500)
- `OPENAI_DAILY_BUDGET` - Daily cost limit in dollars (default: 10.00)
- `OPENAI_SIMILARITY_THRESHOLD` - Duplicate threshold (default: 0.85)

**Server**:
- `NODE_ENV` - Environment (development, production)
- `PORT` - HTTP server port (default: 3000)
- `WS_PORT` - WebSocket server port (default: 3001, or same as PORT)
- `BASE_URL` - Base URL for the site (e.g., https://knowledgefoyer.com)
- `SESSION_SECRET` - Secret for session management

**Redis** (optional, for caching and pub/sub):
- `REDIS_URL` - Redis connection string
- `REDIS_TTL_DEFAULT` - Default cache TTL in seconds (default: 300)

**Security**:
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `RATE_LIMIT_WINDOW` - Rate limit window in minutes (default: 15)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)

**OAuth** (for future Google sign-in):
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `GOOGLE_CALLBACK_URL` - OAuth callback URL

### Configuration Files

**config/default.js** (or similar structure):
```
Contains default values for all configuration
Environment variables override defaults
Sensitive values always from env vars, never hardcoded
```

**config/database.js**:
```
Database configuration including:
- Connection pooling settings
- Query timeouts
- SSL configuration for production
- Migration settings
```

**config/openai.js**:
```
OpenAI-specific configuration:
- Model selections
- Token limits
- Retry policies
- Error handling strategies
- Cost tracking setup
```

**config/websocket.js**:
```
WebSocket configuration:
- Connection limits
- Heartbeat intervals
- Reconnection strategies
- Message size limits
```

### Development vs Production

**Development**:
- More verbose logging (DEBUG level)
- Hot reload enabled
- CORS more permissive
- Email verification optional (or using test service)
- Lower rate limits
- OpenAI API in test mode or reduced usage

**Production**:
- ERROR/WARN logging only
- Strict CORS
- Email verification required
- Higher rate limits
- Full OpenAI API usage
- Connection pooling optimized
- Compression enabled
- Security headers enforced

### Secrets Management

**Development**:
- `.env` file (never committed to git)
- `.env.example` committed as template

**Production**:
- Environment variables via hosting provider
- Secret management service (AWS Secrets Manager, etc.)
- Rotate JWT secrets periodically
- Regular OpenAI API key rotation
- Database password rotation schedule

---

## Conclusion

Knowledge Foyer distinguishes itself through structured feedback that separates utility from sentiment, semantic discovery through tags, treating published work as living documents that improve over time, and an AI-native architecture using cutting-edge protocols.

**Key Differentiators**:
- **MCP-first architecture**: Real-time, bidirectional communication via WebSocket with structured tool-based interactions
- **Dual-utility feedback ranking**: Community curates what's useful as positive and negative feedback independently
- **AI-powered quality control**: OpenAI integration for duplicate detection and automatic feedback resolution tracking
- **Professional credibility platform**: Demonstrate competence through actual work, not performative networking
- **Semantic content discovery**: Tag-based exposition pages connect related work across authors

**Technical Highlights**:
- Hybrid REST + MCP architecture optimizes for both SEO and real-time interaction
- PostgreSQL with pgvector enables efficient similarity search for duplicate detection
- OpenAI API integration provides sophisticated AI features without local GPU requirements
- Progressive Web App design ensures excellent experience across all devices
- Minimal dependency philosophy maintains long-term maintainability

The design prioritizes simplicity without sacrificing necessary functionality, future-proofs where possible without adding complexity, and maintains a clean architecture suitable for incremental development and long-term maintenance.

Implementation should proceed in phases, validating each component before moving to the next, with particular attention to:
1. **WebSocket stability**: Connection management and reconnection handling
2. **Feedback mechanism**: The platform's differentiating feature
3. **OpenAI integration**: Cost controls and graceful degradation
4. **Real-time updates**: Live UI synchronization across clients

The MCP-first approach positions Knowledge Foyer as an AI-native platform from day one, demonstrating advanced protocol adoption while delivering genuine value through structured, quality feedback that helps creators continuously improve their work.

---

## Development Setup

### Prerequisites

**Required Software**:
- Node.js 18+ (LTS recommended)
- PostgreSQL 15+ with pgvector extension
- npm or yarn package manager
- Git for version control

**Recommended Tools**:
- VS Code or preferred editor
- Postman or similar for API testing
- WebSocket testing tool (for MCP debugging)
- PostgreSQL client (psql, pgAdmin, or TablePlus)

### Database Setup

**Installation**:
1. Install PostgreSQL 15+
2. Install pgvector extension: `CREATE EXTENSION vector;`
3. Create database: `CREATE DATABASE knowledge_foyer;`
4. Create development user with appropriate permissions

**Schema Management**:
- Use migration files for schema changes (e.g., node-pg-migrate, Knex, or custom)
- Migrations should be reversible where possible
- Version control all migration files
- Seed data for development/testing

**Initial Schema**:
- Run migrations to create all tables from data models
- Install required extensions (pgvector, uuid-ossp, pg_trgm)
- Create indexes as specified in performance section
- Set up constraints and foreign keys

### Environment Configuration

**Required .env Variables** (development):
```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/knowledge_foyer
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Server
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Authentication
JWT_SECRET=your-256-bit-secret-here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_SECRET=your-session-secret-here

# Email (use test service like Ethereal for development)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your-ethereal-user
SMTP_PASSWORD=your-ethereal-password
EMAIL_FROM=noreply@knowledgefoyer.test
VERIFICATION_TOKEN_EXPIRY=24

# OpenAI (use test key with low limits for development)
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_COMPLETION_MODEL=gpt-4
OPENAI_MAX_TOKENS=500
OPENAI_DAILY_BUDGET=5.00
OPENAI_SIMILARITY_THRESHOLD=0.85

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

**Development vs Production**:
- Development: detailed logging, hot reload, relaxed CORS
- Production: error-only logging, strict security, optimized builds

### Project Structure

```
knowledge-foyer/
├── src/
│   ├── config/           # Configuration files
│   ├── db/              # Database connection, migrations
│   ├── models/          # Data models
│   ├── routes/          # REST endpoints
│   ├── mcp/             # MCP server and tools
│   ├── services/        # Business logic, OpenAI integration
│   ├── middleware/      # Express middleware, auth
│   ├── utils/           # Utilities, helpers
│   └── app.js           # Express app setup
├── public/              # Static assets (CSS, JS, images)
├── views/               # HTML templates (if using SSR)
├── migrations/          # Database migrations
├── tests/               # Test files
├── .env.example         # Environment template
├── .gitignore
├── package.json
├── README.md
└── server.js            # Entry point
```

### Running Locally

**Installation**:
```bash
git clone <repository>
cd knowledge-foyer
npm install
cp .env.example .env
# Edit .env with your values
```

**Database Setup**:
```bash
npm run db:migrate     # Run migrations
npm run db:seed        # Seed development data (optional)
```

**Start Development Server**:
```bash
npm run dev            # Starts with nodemon for auto-reload
```

**Testing**:
```bash
npm test               # Run test suite
npm run test:watch     # Watch mode for development
```

### Subdomain Testing Locally

**Options**:
1. **Hosts file**: Add entries like `127.0.0.1 matthew.localhost`
2. ***.localhost**: Most browsers support `matthew.localhost` natively
3. **Local DNS**: Use dnsmasq or similar for wildcard local domains
4. **Test domain**: Use ngrok or similar for external testing

**Recommended for Development**:
Use `username.localhost:3000` - works in most modern browsers without configuration.

### WebSocket Development

**Testing MCP Connection**:
- Browser DevTools: Network tab → WS filter
- Standalone WebSocket clients (websocat, wscat)
- Custom test scripts for MCP protocol

**Debugging**:
- Log all MCP messages in development
- Use structured logging to trace request flow
- Test reconnection scenarios manually

### OpenAI Integration Testing

**Development Best Practices**:
- Use low daily budget limit to prevent runaway costs
- Cache API responses during development
- Mock OpenAI responses for unit tests
- Use smaller embedding model for development
- Log all API calls with token counts

**Testing Without API**:
- Mock OpenAI responses in tests
- Fallback behavior when API unavailable
- Test error handling thoroughly

### Git Workflow

**Branching Strategy**:
- `main`: production-ready code
- `develop`: integration branch
- `feature/*`: feature branches
- `fix/*`: bug fix branches

**Commit Conventions**:
- Use meaningful commit messages
- Reference issues where applicable
- Squash commits before merging if necessary

### Code Quality

**Linting**:
- ESLint for JavaScript
- Consistent code style across project
- Pre-commit hooks optional but recommended

**Code Review**:
- Review before merging to main/develop
- Check for security issues
- Verify tests pass

---

## Conclusion

Knowledge Foyer distinguishes itself through structured feedback that separates utility from sentiment, semantic discovery through tags, treating published work as living documents that improve over time, and an AI-native architecture using cutting-edge protocols.

**Key Differentiators**:
- **MCP-first architecture**: Real-time, bidirectional communication via WebSocket with structured tool-based interactions
- **Dual-utility feedback ranking**: Community curates what's useful as positive and negative feedback independently
- **AI-powered quality control**: OpenAI integration for duplicate detection and automatic feedback resolution tracking
- **Professional credibility platform**: Demonstrate competence through actual work, not performative networking
- **Semantic content discovery**: Tag-based exposition pages connect related work across authors
- **Social features**: Follow authors, messaging system, custom curated collections

**Technical Highlights**:
- Hybrid REST + MCP architecture optimizes for both SEO and real-time interaction
- PostgreSQL with pgvector enables efficient similarity search for duplicate detection
- OpenAI API integration provides sophisticated AI features without local GPU requirements
- Progressive Web App design ensures excellent experience across all devices
- Minimal dependency philosophy maintains long-term maintainability
- Thoughtful design system balances professionalism with approachability

**Design Philosophy**:
- Content-first approach with generous whitespace and optimal reading experience
- Elegant color palette (warm off-white, deep green, muted gold) conveys quality and seriousness
- Typography system (Inter, Lora, JetBrains Mono) optimized for readability
- Accessibility built-in from the start, not added later
- Mobile-first responsive design

The design prioritizes simplicity without sacrificing necessary functionality, future-proofs where possible without adding complexity, and maintains a clean architecture suitable for incremental development and long-term maintenance.

Implementation should proceed in phases, validating each component before moving to the next, with particular attention to:
1. **WebSocket stability**: Connection management and reconnection handling
2. **Feedback mechanism**: The platform's differentiating feature
3. **OpenAI integration**: Cost controls and graceful degradation
4. **Real-time updates**: Live UI synchronization across clients
5. **Design consistency**: Following the design system throughout

The MCP-first approach positions Knowledge Foyer as an AI-native platform from day one, demonstrating advanced protocol adoption while delivering genuine value through structured, quality feedback that helps creators continuously improve their work. The platform serves professionals who want to demonstrate credibility through real work, receive meaningful feedback, and discover related ideas across a community of serious creators.


