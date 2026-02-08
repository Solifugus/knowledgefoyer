#!/bin/bash

# Knowledge Foyer Integration Testing Setup
# Sets up test database and environment for comprehensive integration tests

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Setting up Knowledge Foyer Integration Testing Environment${NC}"
echo "================================================================"

# Configuration
TEST_DB_NAME="${TEST_DATABASE:-knowledge_foyer_test}"
DB_USER="${TEST_DB_USER:-postgres}"
DB_HOST="${TEST_DB_HOST:-localhost}"
DB_PORT="${TEST_DB_PORT:-5432}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if PostgreSQL is running
check_postgres() {
    print_info "Checking PostgreSQL connection..."

    if pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; then
        print_status "PostgreSQL is running and accessible"
    else
        print_error "PostgreSQL is not running or not accessible"
        print_info "Please ensure PostgreSQL is installed and running:"
        echo "  - On Ubuntu/Debian: sudo systemctl start postgresql"
        echo "  - On macOS with Homebrew: brew services start postgresql"
        echo "  - Or start PostgreSQL manually"
        exit 1
    fi
}

# Create test database
create_test_database() {
    print_info "Setting up test database: $TEST_DB_NAME"

    # Check if test database exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$TEST_DB_NAME"; then
        print_warning "Test database $TEST_DB_NAME already exists"
        read -p "Do you want to recreate it? This will delete all existing test data. (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Dropping existing test database..."
            dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$TEST_DB_NAME"
        else
            print_info "Using existing test database"
            return 0
        fi
    fi

    # Create test database
    print_info "Creating test database: $TEST_DB_NAME"
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$TEST_DB_NAME"
    print_status "Test database created successfully"
}

# Set up database extensions
setup_database_extensions() {
    print_info "Setting up database extensions..."

    # Install required extensions
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null
    print_status "uuid-ossp extension installed"

    # Check if pgvector is available and install it
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1; then
        print_status "pgvector extension installed"
    else
        print_warning "pgvector extension not available"
        print_info "AI features may not work in tests. To install pgvector:"
        echo "  - On Ubuntu/Debian: sudo apt install postgresql-16-pgvector"
        echo "  - On macOS: brew install pgvector"
        echo "  - Or compile from source: https://github.com/pgvector/pgvector"
    fi

    # Install other useful extensions for testing
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null 2>&1 || true
}

# Run database migrations on test database
run_test_migrations() {
    print_info "Running database migrations on test database..."

    # Set environment variables for migration
    export NODE_ENV=test
    export DATABASE_URL="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$TEST_DB_NAME"

    # Run migrations
    if [ -f "migrations/migrate.js" ]; then
        node migrations/migrate.js
        print_status "Database migrations completed"
    else
        print_warning "Migration file not found. You may need to run migrations manually."
    fi
}

# Create test environment file
create_test_env() {
    print_info "Creating test environment configuration..."

    cat > .env.test << EOF
# Knowledge Foyer Integration Test Environment
NODE_ENV=test

# Test Database Configuration
DATABASE_URL=postgresql://$DB_USER@$DB_HOST:$DB_PORT/$TEST_DB_NAME
TEST_DATABASE=$TEST_DB_NAME
TEST_DB_USER=$DB_USER
TEST_DB_HOST=$DB_HOST
TEST_DB_PORT=$DB_PORT

# JWT Configuration for Tests
JWT_SECRET=test-integration-secret-key-do-not-use-in-production
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# Server Configuration
PORT=3000
WS_PORT=3001

# Disable external services in tests
DISABLE_EMAIL=true
DISABLE_OPENAI=true
DISABLE_REDIS=true

# Test-specific configuration
LOG_LEVEL=error
TEST_VERBOSE=false
CI=false

# Rate limiting (more permissive for tests)
LOGIN_RATE_LIMIT_PER_15MIN=100
API_RATE_LIMIT_PER_15MIN=1000
EOF

    print_status "Test environment file (.env.test) created"
}

# Validate test setup
validate_test_setup() {
    print_info "Validating test setup..."

    # Test database connection
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        print_status "Test database connection successful"
    else
        print_error "Test database connection failed"
        exit 1
    fi

    # Check if required tables exist (after migrations)
    table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

    if [ "$table_count" -gt 0 ]; then
        print_status "Database tables found ($table_count tables)"
    else
        print_warning "No tables found in test database. You may need to run migrations."
    fi

    # Check Node.js and npm
    if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
        print_status "Node.js and npm are available"
    else
        print_error "Node.js or npm not found. Please install Node.js 18+ and npm."
        exit 1
    fi

    # Check if test dependencies are installed
    if [ -d "node_modules" ] && [ -f "node_modules/.bin/jest" ]; then
        print_status "Test dependencies are installed"
    else
        print_warning "Test dependencies may not be installed. Run 'npm install' first."
    fi
}

# Run a quick test to verify everything is working
run_verification_test() {
    print_info "Running verification test..."

    # Set test environment
    export NODE_ENV=test
    export DATABASE_URL="postgresql://$DB_USER@$DB_HOST:$DB_PORT/$TEST_DB_NAME"

    # Run a simple Jest test to verify setup
    if npm test -- --testNamePattern="Backend API Integration Tests" --verbose=false --silent >/dev/null 2>&1; then
        print_status "Verification test passed"
    else
        print_warning "Verification test failed. Check the setup and try running tests manually:"
        echo "  npm test tests/integration/backend/api-complete.test.js"
    fi
}

# Print usage information
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --skip-db-create    Skip database creation (use existing test database)"
    echo "  --skip-migrations   Skip running database migrations"
    echo "  --skip-verification Skip verification test"
    echo "  --recreate-db      Force recreation of test database"
    echo "  --help             Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  TEST_DATABASE       Test database name (default: knowledge_foyer_test)"
    echo "  TEST_DB_USER        Database user (default: postgres)"
    echo "  TEST_DB_HOST        Database host (default: localhost)"
    echo "  TEST_DB_PORT        Database port (default: 5432)"
}

# Parse command line arguments
SKIP_DB_CREATE=false
SKIP_MIGRATIONS=false
SKIP_VERIFICATION=false
RECREATE_DB=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-db-create)
            SKIP_DB_CREATE=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --skip-verification)
            SKIP_VERIFICATION=true
            shift
            ;;
        --recreate-db)
            RECREATE_DB=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    echo -e "${BLUE}Starting integration test setup...${NC}"

    # Check prerequisites
    check_postgres

    # Database setup
    if [ "$SKIP_DB_CREATE" = false ]; then
        create_test_database
        setup_database_extensions
    fi

    # Run migrations
    if [ "$SKIP_MIGRATIONS" = false ]; then
        run_test_migrations
    fi

    # Create test environment configuration
    create_test_env

    # Validate setup
    validate_test_setup

    # Run verification test
    if [ "$SKIP_VERIFICATION" = false ]; then
        run_verification_test
    fi

    echo ""
    echo -e "${GREEN}🎉 Integration test setup completed successfully!${NC}"
    echo ""
    echo "You can now run integration tests:"
    echo -e "${BLUE}  # Run all integration tests${NC}"
    echo "  npm test tests/integration/"
    echo ""
    echo -e "${BLUE}  # Run specific test suites${NC}"
    echo "  npm test tests/integration/backend/api-complete.test.js"
    echo "  npm test tests/integration/backend/websocket-mcp.test.js"
    echo ""
    echo -e "${BLUE}  # Run with coverage${NC}"
    echo "  npm test -- --coverage tests/integration/"
    echo ""
    echo -e "${BLUE}Test database: $TEST_DB_NAME${NC}"
    echo -e "${BLUE}Environment file: .env.test${NC}"
    echo ""
}

# Execute main function
main