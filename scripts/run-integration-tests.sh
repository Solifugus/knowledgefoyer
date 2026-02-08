#!/bin/bash

# Knowledge Foyer - Integration Test Runner
# Comprehensive script to run all integration tests with proper setup and reporting

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PROJECT_ROOT/test-logs"

# Test configuration
RUN_SETUP=${RUN_SETUP:-true}
RUN_BACKEND_TESTS=${RUN_BACKEND_TESTS:-true}
RUN_FRONTEND_TESTS=${RUN_FRONTEND_TESTS:-true}
RUN_E2E_TESTS=${RUN_E2E_TESTS:-true}
GENERATE_COVERAGE=${GENERATE_COVERAGE:-true}
HEADLESS=${HEADLESS:-true}

# Function to print colored output
print_header() {
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}============================================================${NC}"
}

print_section() {
    echo -e "\n${BLUE}🔧 $1${NC}"
    echo -e "${BLUE}$(printf '=%.0s' {1..50})${NC}"
}

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

print_test_result() {
    local test_name="$1"
    local status="$2"
    local duration="$3"

    if [ "$status" = "PASSED" ]; then
        echo -e "${GREEN}✅ $test_name${NC} ${CYAN}(${duration}s)${NC}"
    else
        echo -e "${RED}❌ $test_name${NC} ${CYAN}(${duration}s)${NC}"
    fi
}

# Function to setup test environment
setup_test_environment() {
    print_section "Setting up test environment"

    # Create logs directory
    mkdir -p "$LOGS_DIR"

    # Run integration test setup if needed
    if [ "$RUN_SETUP" = true ]; then
        print_info "Running integration test setup..."
        if "$SCRIPT_DIR/setup-integration-tests.sh" --skip-verification > "$LOGS_DIR/setup.log" 2>&1; then
            print_status "Test environment setup completed"
        else
            print_error "Test environment setup failed. Check $LOGS_DIR/setup.log"
            return 1
        fi
    else
        print_info "Skipping test environment setup"
    fi

    # Install dependencies if needed
    if [ ! -d "$PROJECT_ROOT/node_modules" ] || [ ! -f "$PROJECT_ROOT/node_modules/.bin/jest" ]; then
        print_info "Installing dependencies..."
        cd "$PROJECT_ROOT"
        npm install > "$LOGS_DIR/npm-install.log" 2>&1
        print_status "Dependencies installed"
    fi
}

# Function to run backend integration tests
run_backend_tests() {
    print_section "Running Backend Integration Tests"

    local start_time=$(date +%s)

    print_info "Starting backend API integration tests..."

    # API Integration Tests
    if npm test tests/integration/backend/api-complete.test.js > "$LOGS_DIR/backend-api.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "Backend API Integration" "PASSED" "$duration"
        BACKEND_API_STATUS="PASSED"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "Backend API Integration" "FAILED" "$duration"
        print_error "Check $LOGS_DIR/backend-api.log for details"
        BACKEND_API_STATUS="FAILED"
    fi

    # WebSocket/MCP Integration Tests
    start_time=$(date +%s)
    print_info "Starting WebSocket/MCP integration tests..."

    if npm test tests/integration/backend/websocket-mcp.test.js > "$LOGS_DIR/backend-websocket.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "WebSocket/MCP Integration" "PASSED" "$duration"
        WEBSOCKET_STATUS="PASSED"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "WebSocket/MCP Integration" "FAILED" "$duration"
        print_error "Check $LOGS_DIR/backend-websocket.log for details"
        WEBSOCKET_STATUS="FAILED"
    fi
}

# Function to run frontend integration tests
run_frontend_tests() {
    print_section "Running Frontend Integration Tests"

    local start_time=$(date +%s)

    # Set environment variables for frontend tests
    export HEADLESS="$HEADLESS"
    export DEBUG_BROWSER="false"
    export DEBUG_NETWORK="false"

    print_info "Starting SPA + API integration tests..."
    print_info "Browser headless mode: $HEADLESS"

    if npm test tests/integration/frontend/spa-api-integration.test.js > "$LOGS_DIR/frontend-spa.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "SPA + API Integration" "PASSED" "$duration"
        FRONTEND_SPA_STATUS="PASSED"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "SPA + API Integration" "FAILED" "$duration"
        print_error "Check $LOGS_DIR/frontend-spa.log for details"
        FRONTEND_SPA_STATUS="FAILED"
    fi
}

# Function to run end-to-end tests
run_e2e_tests() {
    print_section "Running End-to-End Tests"

    local start_time=$(date +%s)

    print_info "Starting end-to-end user journey tests..."

    if npm test tests/e2e/ > "$LOGS_DIR/e2e-tests.log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "End-to-End Tests" "PASSED" "$duration"
        E2E_STATUS="PASSED"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        print_test_result "End-to-End Tests" "FAILED" "$duration"
        print_error "Check $LOGS_DIR/e2e-tests.log for details"
        E2E_STATUS="FAILED"
    fi
}

# Function to generate coverage report
generate_coverage_report() {
    print_section "Generating Coverage Report"

    print_info "Generating comprehensive test coverage report..."

    if npm run test:coverage > "$LOGS_DIR/coverage.log" 2>&1; then
        print_status "Coverage report generated"

        # Display coverage summary
        if [ -f "$PROJECT_ROOT/coverage/lcov-report/index.html" ]; then
            print_info "Coverage report available at: coverage/lcov-report/index.html"
        fi

        COVERAGE_STATUS="PASSED"
    else
        print_error "Coverage report generation failed"
        print_error "Check $LOGS_DIR/coverage.log for details"
        COVERAGE_STATUS="FAILED"
    fi
}

# Function to run performance tests
run_performance_tests() {
    print_section "Running Performance Tests"

    print_info "Performance testing is part of integration tests"
    print_info "Check individual test logs for performance metrics"
}

# Function to cleanup test environment
cleanup_test_environment() {
    print_section "Cleaning up test environment"

    # Kill any remaining test processes
    pkill -f "knowledge.*test" 2>/dev/null || true

    # Clean up test database connections
    print_info "Closing test database connections..."

    print_status "Cleanup completed"
}

# Function to print test summary
print_test_summary() {
    print_header "🧪 INTEGRATION TEST RESULTS SUMMARY"

    echo -e "\n${PURPLE}Test Suite Results:${NC}"
    echo -e "${PURPLE}===================${NC}"

    # Backend Tests
    if [ "$RUN_BACKEND_TESTS" = true ]; then
        print_test_result "Backend API Integration" "$BACKEND_API_STATUS" "-"
        print_test_result "WebSocket/MCP Integration" "$WEBSOCKET_STATUS" "-"
    else
        echo -e "${YELLOW}⏭️  Backend tests skipped${NC}"
    fi

    # Frontend Tests
    if [ "$RUN_FRONTEND_TESTS" = true ]; then
        print_test_result "Frontend SPA Integration" "$FRONTEND_SPA_STATUS" "-"
    else
        echo -e "${YELLOW}⏭️  Frontend tests skipped${NC}"
    fi

    # E2E Tests
    if [ "$RUN_E2E_TESTS" = true ]; then
        print_test_result "End-to-End Tests" "$E2E_STATUS" "-"
    else
        echo -e "${YELLOW}⏭️  E2E tests skipped${NC}"
    fi

    # Coverage
    if [ "$GENERATE_COVERAGE" = true ]; then
        print_test_result "Coverage Report" "$COVERAGE_STATUS" "-"
    else
        echo -e "${YELLOW}⏭️  Coverage report skipped${NC}"
    fi

    # Overall result
    echo -e "\n${PURPLE}Overall Result:${NC}"
    echo -e "${PURPLE}===============${NC}"

    local failed_tests=0
    [ "$BACKEND_API_STATUS" = "FAILED" ] && ((failed_tests++))
    [ "$WEBSOCKET_STATUS" = "FAILED" ] && ((failed_tests++))
    [ "$FRONTEND_SPA_STATUS" = "FAILED" ] && ((failed_tests++))
    [ "$E2E_STATUS" = "FAILED" ] && ((failed_tests++))

    if [ $failed_tests -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL INTEGRATION TESTS PASSED!${NC}"
        echo -e "${GREEN}Knowledge Foyer integration is working correctly.${NC}"
    else
        echo -e "${RED}❌ $failed_tests test suite(s) failed${NC}"
        echo -e "${RED}Check individual test logs in $LOGS_DIR/ for details${NC}"
    fi

    # Log file information
    echo -e "\n${PURPLE}Test Logs:${NC}"
    echo -e "${PURPLE}===========${NC}"
    echo -e "${BLUE}📁 Log directory: $LOGS_DIR${NC}"
    echo -e "${BLUE}📄 Available logs:${NC}"
    ls -la "$LOGS_DIR"/ 2>/dev/null | grep -E "\.(log)$" | while read -r line; do
        echo -e "${CYAN}   $line${NC}"
    done

    return $failed_tests
}

# Function to print usage
print_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run comprehensive integration tests for Knowledge Foyer"
    echo ""
    echo "Options:"
    echo "  --skip-setup          Skip test environment setup"
    echo "  --skip-backend        Skip backend integration tests"
    echo "  --skip-frontend       Skip frontend integration tests"
    echo "  --skip-e2e            Skip end-to-end tests"
    echo "  --skip-coverage       Skip coverage report generation"
    echo "  --no-headless         Run browser tests in visible mode"
    echo "  --quick               Run only critical tests (backend API + basic E2E)"
    echo "  --help                Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  RUN_SETUP=false       Skip setup (default: true)"
    echo "  RUN_BACKEND_TESTS=false  Skip backend tests (default: true)"
    echo "  RUN_FRONTEND_TESTS=false Skip frontend tests (default: true)"
    echo "  RUN_E2E_TESTS=false    Skip E2E tests (default: true)"
    echo "  GENERATE_COVERAGE=false Skip coverage (default: true)"
    echo "  HEADLESS=false         Run browsers visibly (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Run all tests"
    echo "  $0 --skip-frontend    # Skip frontend integration tests"
    echo "  $0 --quick            # Run only critical tests"
    echo "  $0 --no-headless      # Run with visible browser"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-setup)
            RUN_SETUP=false
            shift
            ;;
        --skip-backend)
            RUN_BACKEND_TESTS=false
            shift
            ;;
        --skip-frontend)
            RUN_FRONTEND_TESTS=false
            shift
            ;;
        --skip-e2e)
            RUN_E2E_TESTS=false
            shift
            ;;
        --skip-coverage)
            GENERATE_COVERAGE=false
            shift
            ;;
        --no-headless)
            HEADLESS=false
            shift
            ;;
        --quick)
            RUN_FRONTEND_TESTS=false
            GENERATE_COVERAGE=false
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
    # Initialize status variables
    BACKEND_API_STATUS="SKIPPED"
    WEBSOCKET_STATUS="SKIPPED"
    FRONTEND_SPA_STATUS="SKIPPED"
    E2E_STATUS="SKIPPED"
    COVERAGE_STATUS="SKIPPED"

    # Change to project directory
    cd "$PROJECT_ROOT"

    print_header "🚀 Knowledge Foyer Integration Test Suite"
    print_info "Starting comprehensive integration testing..."
    print_info "Project root: $PROJECT_ROOT"
    print_info "Logs directory: $LOGS_DIR"

    local overall_start_time=$(date +%s)

    # Setup test environment
    setup_test_environment

    # Run test suites
    if [ "$RUN_BACKEND_TESTS" = true ]; then
        run_backend_tests
    fi

    if [ "$RUN_FRONTEND_TESTS" = true ]; then
        run_frontend_tests
    fi

    if [ "$RUN_E2E_TESTS" = true ]; then
        run_e2e_tests
    fi

    # Generate coverage report
    if [ "$GENERATE_COVERAGE" = true ]; then
        generate_coverage_report
    fi

    # Cleanup
    cleanup_test_environment

    local overall_end_time=$(date +%s)
    local total_duration=$((overall_end_time - overall_start_time))

    # Print summary
    echo -e "\n${PURPLE}Total test execution time: ${total_duration}s${NC}"
    print_test_summary

    # Return appropriate exit code
    local exit_code=$?
    exit $exit_code
}

# Execute main function
main