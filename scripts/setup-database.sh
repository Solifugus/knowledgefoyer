#!/bin/bash

# Knowledge Foyer Database Setup Script
# Automated PostgreSQL setup for development and production

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

# Parse database URL
parse_database_url() {
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL not found in environment"
    fi

    # Extract components from postgres://user:pass@host:port/dbname
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

    if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
        error "Invalid DATABASE_URL format. Expected: postgresql://user:password@host:port/database"
    fi

    log "Database configuration:"
    echo "  User: $DB_USER"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
}

# Check if PostgreSQL is installed and running
check_postgresql() {
    log "Checking PostgreSQL installation..."

    if ! command -v psql &> /dev/null; then
        error "PostgreSQL is not installed. Install it with:
  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib
  CentOS/RHEL:   sudo yum install postgresql postgresql-server
  macOS:         brew install postgresql"
    fi

    success "PostgreSQL is installed: $(psql --version | head -1)"

    # Check if PostgreSQL is running
    if ! pgrep -x postgres > /dev/null; then
        warning "PostgreSQL is not running. Starting it..."
        if command -v systemctl &> /dev/null; then
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        else
            sudo service postgresql start
        fi
    fi

    success "PostgreSQL is running"
}

# Check if pgvector extension is available
check_pgvector() {
    log "Checking pgvector extension availability..."

    # Try to find pgvector
    if sudo -u postgres psql -c "CREATE EXTENSION IF NOT EXISTS vector;" template1 &>/dev/null; then
        success "pgvector extension is available"
    else
        warning "pgvector extension not found. Installing..."

        # Try to install pgvector
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y postgresql-pgvector
        elif command -v yum &> /dev/null; then
            sudo yum install -y pgvector
        else
            error "Cannot automatically install pgvector. Please install it manually:
  Ubuntu/Debian: sudo apt-get install postgresql-pgvector
  CentOS/RHEL:   sudo yum install pgvector
  From source:   https://github.com/pgvector/pgvector"
        fi
    fi
}

# Create database user if it doesn't exist
create_user() {
    log "Creating database user '$DB_USER'..."

    # Check if user already exists
    if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
        success "User '$DB_USER' already exists"
    else
        sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
        success "User '$DB_USER' created"
    fi

    # Grant necessary permissions
    sudo -u postgres psql -c "ALTER USER $DB_USER CREATEDB;"
    success "User '$DB_USER' granted CREATEDB permission"
}

# Create database if it doesn't exist
create_database() {
    log "Creating database '$DB_NAME'..."

    # Check if database already exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        success "Database '$DB_NAME' already exists"
    else
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
        success "Database '$DB_NAME' created"
    fi

    # Grant all privileges
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
    success "Privileges granted to '$DB_USER' on '$DB_NAME'"
}

# Install required extensions
install_extensions() {
    log "Installing PostgreSQL extensions..."

    # Connect to the database and install extensions
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";
        CREATE EXTENSION IF NOT EXISTS vector;
    " || error "Failed to install extensions"

    success "Extensions installed successfully"
}

# Test database connection
test_connection() {
    log "Testing database connection..."

    # Test connection with our application's database config
    cd "$PROJECT_ROOT"
    if node -e "
        const { testConnection } = require('./src/config/database');
        testConnection().then(success => {
            if (success) {
                console.log('✅ Database connection successful');
                process.exit(0);
            } else {
                console.error('❌ Database connection failed');
                process.exit(1);
            }
        }).catch(err => {
            console.error('❌ Database connection error:', err.message);
            process.exit(1);
        });
    "; then
        success "Application can connect to database"
    else
        error "Application cannot connect to database"
    fi
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."

    cd "$PROJECT_ROOT"
    if node migrations/migrate.js; then
        success "Database migrations completed"
    else
        error "Database migrations failed"
    fi
}

# Update environment file with actual database credentials
update_env_file() {
    log "Updating .env file with database credentials..."

    # Create backup of .env
    cp "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.backup"

    # Update DATABASE_URL if needed
    if [ "$DB_PASS" = "password" ]; then
        warning ".env still contains placeholder password. Consider updating it."
    fi

    # Update the database URL with actual values
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME|g" "$PROJECT_ROOT/.env"

    success ".env file updated"
}

# Generate sample data for development
generate_sample_data() {
    if [ "$NODE_ENV" = "development" ]; then
        log "Generating sample data for development..."

        cd "$PROJECT_ROOT"
        if [ -f "scripts/seed-data.js" ]; then
            node scripts/seed-data.js
            success "Sample data generated"
        else
            warning "No seed data script found, skipping sample data generation"
        fi
    fi
}

# Display connection information
display_connection_info() {
    echo ""
    echo "🗄️  Database Setup Complete!"
    echo "================================"
    echo ""
    echo "📊 Connection Details:"
    echo "   Host: $DB_HOST:$DB_PORT"
    echo "   Database: $DB_NAME"
    echo "   User: $DB_USER"
    echo ""
    echo "🔗 Connection String:"
    echo "   $DATABASE_URL"
    echo ""
    echo "🧪 Test Connection:"
    echo "   psql '$DATABASE_URL'"
    echo ""
    echo "🚀 Next Steps:"
    echo "   1. Start your application: npm run dev"
    echo "   2. Test endpoints with database: curl http://localhost/api/stats"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "🗄️  Knowledge Foyer Database Setup"
    echo "=================================="
    echo ""

    parse_database_url
    check_postgresql
    check_pgvector
    create_user
    create_database
    install_extensions
    update_env_file
    test_connection
    run_migrations
    generate_sample_data
    display_connection_info

    success "Database setup completed successfully!"
}

# Handle command line arguments
case "${1:-setup}" in
    setup)
        main
        ;;
    test)
        parse_database_url
        test_connection
        ;;
    migrate)
        parse_database_url
        test_connection
        run_migrations
        ;;
    clean)
        parse_database_url
        log "Dropping database '$DB_NAME'..."
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;"
        success "Database and user removed"
        ;;
    *)
        echo "Usage: $0 {setup|test|migrate|clean}"
        echo ""
        echo "Commands:"
        echo "  setup   - Complete database setup (default)"
        echo "  test    - Test database connection"
        echo "  migrate - Run migrations only"
        echo "  clean   - Remove database and user"
        echo ""
        exit 1
        ;;
esac