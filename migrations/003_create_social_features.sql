-- Migration 003: Create Social Features System
-- Created: 2026-01-21T04:15:00.000Z

BEGIN;

-- User Follows table - tracks who follows whom
CREATE TABLE follows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(follower_id, followed_id),
    CONSTRAINT no_self_follow CHECK (follower_id != followed_id)
);

-- Messages table - user posts and messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'post' CHECK (message_type IN ('post', 'announcement', 'system')),
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'private')),
    reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL, -- For article announcements
    metadata JSONB DEFAULT '{}'::JSONB, -- Extra data for different message types
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table - system notifications for users
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'new_follower', 'new_article', 'article_updated', 'new_message',
        'message_reply', 'feedback_received', 'feedback_resolved'
    )),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    data JSONB DEFAULT '{}'::JSONB, -- Additional notification data
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

-- Feed Items table - aggregated timeline items
CREATE TABLE feed_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who this feed item belongs to
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN (
        'message', 'article_published', 'article_updated', 'user_followed', 'user_joined'
    )),
    source_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who created the content
    source_id UUID, -- ID of the source (message_id, article_id, etc)
    title VARCHAR(255) NOT NULL,
    content TEXT,
    data JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Update users table to add social counters
ALTER TABLE users ADD COLUMN following_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN followers_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN messages_count INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_followed_id ON follows(followed_id);
CREATE INDEX idx_follows_created_at ON follows(created_at);

CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_messages_message_type ON messages(message_type);
CREATE INDEX idx_messages_visibility ON messages(visibility);
CREATE INDEX idx_messages_reply_to_id ON messages(reply_to_id);
CREATE INDEX idx_messages_article_id ON messages(article_id);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_expires_at ON notifications(expires_at);

CREATE INDEX idx_feed_items_user_created ON feed_items(user_id, created_at DESC);
CREATE INDEX idx_feed_items_source_user ON feed_items(source_user_id);
CREATE INDEX idx_feed_items_type ON feed_items(item_type);
CREATE INDEX idx_feed_items_source_id ON feed_items(source_id);

-- Triggers to update user counters

-- Update followers count when follow relationship changes
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment follower count for followed user
        UPDATE users SET followers_count = followers_count + 1 WHERE id = NEW.followed_id;
        -- Increment following count for follower
        UPDATE users SET following_count = following_count + 1 WHERE id = NEW.follower_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement follower count for followed user
        UPDATE users SET followers_count = followers_count - 1 WHERE id = OLD.followed_id;
        -- Decrement following count for follower
        UPDATE users SET following_count = following_count - 1 WHERE id = OLD.follower_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_follow_counts_trigger
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW
    EXECUTE FUNCTION update_follow_counts();

-- Update messages count when messages change
CREATE OR REPLACE FUNCTION update_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET messages_count = messages_count + 1 WHERE id = NEW.user_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET messages_count = messages_count - 1 WHERE id = OLD.user_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_message_count_trigger
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_message_count();

-- Auto-update updated_at for messages
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_messages_updated_at_trigger
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_messages_updated_at();

-- Function to create feed items for followers when user posts
CREATE OR REPLACE FUNCTION create_feed_items_for_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create feed items for public and follower-visible messages
    IF NEW.visibility IN ('public', 'followers') THEN
        -- Insert feed item for author's own feed
        INSERT INTO feed_items (
            user_id, item_type, source_user_id, source_id,
            title, content, created_at
        ) VALUES (
            NEW.user_id, 'message', NEW.user_id, NEW.id,
            'Posted a message', NEW.content, NEW.created_at
        );

        -- Insert feed items for all followers if public or followers-only
        IF NEW.visibility = 'public' OR NEW.visibility = 'followers' THEN
            INSERT INTO feed_items (
                user_id, item_type, source_user_id, source_id,
                title, content, created_at
            )
            SELECT
                f.follower_id, 'message', NEW.user_id, NEW.id,
                'Posted a message', NEW.content, NEW.created_at
            FROM follows f
            WHERE f.followed_id = NEW.user_id
            AND (NEW.visibility = 'public' OR f.follower_id IN (
                SELECT follower_id FROM follows WHERE followed_id = NEW.user_id
            ));
        END IF;
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_feed_items_for_message_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION create_feed_items_for_message();

-- Function to create notifications for new followers
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for the followed user
    INSERT INTO notifications (
        user_id, type, title, content, data
    ) VALUES (
        NEW.followed_id,
        'new_follower',
        'New Follower',
        (SELECT username FROM users WHERE id = NEW.follower_id) || ' started following you',
        jsonb_build_object('follower_id', NEW.follower_id, 'follower_username',
            (SELECT username FROM users WHERE id = NEW.follower_id))
    );

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_follow_notification_trigger
    AFTER INSERT ON follows
    FOR EACH ROW
    EXECUTE FUNCTION create_follow_notification();

-- Utility functions

-- Get user's feed
CREATE OR REPLACE FUNCTION get_user_feed(user_uuid UUID, feed_limit INTEGER DEFAULT 50, feed_offset INTEGER DEFAULT 0)
RETURNS TABLE(
    id UUID,
    item_type VARCHAR,
    source_user_id UUID,
    source_username VARCHAR,
    source_display_name VARCHAR,
    source_id UUID,
    title VARCHAR,
    content TEXT,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id,
        fi.item_type,
        fi.source_user_id,
        u.username,
        u.display_name,
        fi.source_id,
        fi.title,
        fi.content,
        fi.data,
        fi.created_at
    FROM feed_items fi
    LEFT JOIN users u ON fi.source_user_id = u.id
    WHERE fi.user_id = user_uuid
    ORDER BY fi.created_at DESC
    LIMIT feed_limit OFFSET feed_offset;
END;
$$ language 'plpgsql';

-- Get user's followers
CREATE OR REPLACE FUNCTION get_user_followers(user_uuid UUID, result_limit INTEGER DEFAULT 50, result_offset INTEGER DEFAULT 0)
RETURNS TABLE(
    user_id UUID,
    username VARCHAR,
    display_name VARCHAR,
    followed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.username,
        u.display_name,
        f.created_at
    FROM follows f
    LEFT JOIN users u ON f.follower_id = u.id
    WHERE f.followed_id = user_uuid
    ORDER BY f.created_at DESC
    LIMIT result_limit OFFSET result_offset;
END;
$$ language 'plpgsql';

-- Get user's following
CREATE OR REPLACE FUNCTION get_user_following(user_uuid UUID, result_limit INTEGER DEFAULT 50, result_offset INTEGER DEFAULT 0)
RETURNS TABLE(
    user_id UUID,
    username VARCHAR,
    display_name VARCHAR,
    followed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.username,
        u.display_name,
        f.created_at
    FROM follows f
    LEFT JOIN users u ON f.followed_id = u.id
    WHERE f.follower_id = user_uuid
    ORDER BY f.created_at DESC
    LIMIT result_limit OFFSET result_offset;
END;
$$ language 'plpgsql';

-- Check if user A follows user B
CREATE OR REPLACE FUNCTION is_following(follower_uuid UUID, followed_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM follows
        WHERE follower_id = follower_uuid AND followed_id = followed_uuid
    );
END;
$$ language 'plpgsql';

-- Get unread notifications count
CREATE OR REPLACE FUNCTION get_unread_notifications_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM notifications
        WHERE user_id = user_uuid
        AND is_read = false
        AND (expires_at IS NULL OR expires_at > NOW())
    );
END;
$$ language 'plpgsql';

-- Clean up expired notifications (should be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM notifications
    WHERE expires_at IS NOT NULL AND expires_at <= NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

COMMIT;