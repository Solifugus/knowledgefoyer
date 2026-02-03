#!/bin/bash

# Knowledge Foyer Production Deployment Script
# Comprehensive deployment automation for production environments

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env.production"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.production.yml"
BACKUP_DIR="/opt/knowledge-foyer/backups"
LOG_FILE="/var/log/knowledge-foyer/deploy.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment configuration
DEPLOYMENT_MODE="${DEPLOYMENT_MODE:-rolling}"  # rolling, blue-green, maintenance
HEALTH_CHECK_TIMEOUT=300  # 5 minutes
ROLLBACK_ENABLED="${ROLLBACK_ENABLED:-true}"
BACKUP_BEFORE_DEPLOY="${BACKUP_BEFORE_DEPLOY:-true}"

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================
setup_logging() {
    mkdir -p "$(dirname "$LOG_FILE")"
    exec 1> >(tee -a "$LOG_FILE")
    exec 2> >(tee -a "$LOG_FILE" >&2)
}

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case $level in
        "INFO")  echo -e "${GREEN}[$timestamp] INFO: $message${NC}" ;;
        "WARN")  echo -e "${YELLOW}[$timestamp] WARN: $message${NC}" ;;
        "ERROR") echo -e "${RED}[$timestamp] ERROR: $message${NC}" ;;
        "DEBUG") echo -e "${BLUE}[$timestamp] DEBUG: $message${NC}" ;;
        *)       echo -e "[$timestamp] $level: $message" ;;
    esac
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================
check_dependencies() {
    log "INFO" "Checking deployment dependencies..."

    local deps=("docker" "docker-compose" "curl" "jq" "pg_dump" "redis-cli")
    local missing=()

    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing+=("$dep")
        fi
    done

    if [ ${#missing[@]} -ne 0 ]; then
        log "ERROR" "Missing dependencies: ${missing[*]}"
        exit 1
    fi

    log "INFO" "All dependencies satisfied"
}

check_environment() {
    log "INFO" "Checking environment configuration..."

    if [ ! -f "$ENV_FILE" ]; then
        log "ERROR" "Production environment file not found: $ENV_FILE"
        log "INFO" "Please copy .env.production.example to .env.production and configure it"
        exit 1
    fi

    # Load environment variables
    source "$ENV_FILE"

    # Check critical variables
    local required_vars=(
        "NODE_ENV"
        "DATABASE_URL"
        "JWT_SECRET"
        "POSTGRES_PASSWORD"
    )

    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -ne 0 ]; then
        log "ERROR" "Missing required environment variables: ${missing_vars[*]}"
        exit 1
    fi

    log "INFO" "Environment configuration valid"
}

check_disk_space() {
    log "INFO" "Checking disk space..."

    local available=$(df / | awk 'NR==2 {print $4}')
    local required=1048576  # 1GB in KB

    if [ "$available" -lt "$required" ]; then
        log "ERROR" "Insufficient disk space. Available: ${available}KB, Required: ${required}KB"
        exit 1
    fi

    log "INFO" "Sufficient disk space available"
}

# =============================================================================
# BACKUP FUNCTIONS
# =============================================================================
create_backup() {
    if [ "$BACKUP_BEFORE_DEPLOY" = "true" ]; then
        log "INFO" "Creating pre-deployment backup..."

        local backup_timestamp=$(date '+%Y%m%d_%H%M%S')
        local backup_name="knowledge_foyer_backup_$backup_timestamp"

        mkdir -p "$BACKUP_DIR"

        # Database backup
        if docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
            log "INFO" "Backing up PostgreSQL database..."
            docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump \
                -U postgres -d knowledge_foyer_prod \
                | gzip > "$BACKUP_DIR/${backup_name}_db.sql.gz"
        fi

        # Application data backup
        log "INFO" "Backing up application data..."
        docker-compose -f "$COMPOSE_FILE" run --rm app tar czf - \
            /app/uploads /app/logs 2>/dev/null \
            > "$BACKUP_DIR/${backup_name}_data.tar.gz" || true

        # Store backup info
        echo "$backup_name" > "$BACKUP_DIR/latest_backup"

        log "INFO" "Backup completed: $backup_name"
    fi
}

# =============================================================================
# HEALTH CHECK FUNCTIONS
# =============================================================================
wait_for_health() {
    local service_url="$1"
    local timeout="$2"
    local start_time=$(date +%s)

    log "INFO" "Waiting for service health check: $service_url"

    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $timeout ]; then
            log "ERROR" "Health check timeout after ${timeout}s"
            return 1
        fi

        if curl -sf "$service_url" > /dev/null 2>&1; then
            log "INFO" "Service is healthy"
            return 0
        fi

        log "DEBUG" "Service not ready, waiting... (${elapsed}s/${timeout}s)"
        sleep 5
    done
}

check_service_health() {
    log "INFO" "Performing comprehensive health checks..."

    # Application health
    if ! wait_for_health "http://localhost/health" "$HEALTH_CHECK_TIMEOUT"; then
        return 1
    fi

    # Database health
    if ! docker-compose -f "$COMPOSE_FILE" exec postgres pg_isready -U postgres > /dev/null; then
        log "ERROR" "Database health check failed"
        return 1
    fi

    # Redis health
    if ! docker-compose -f "$COMPOSE_FILE" exec redis redis-cli ping | grep -q "PONG"; then
        log "ERROR" "Redis health check failed"
        return 1
    fi

    log "INFO" "All services are healthy"
    return 0
}

# =============================================================================
# DEPLOYMENT FUNCTIONS
# =============================================================================
pull_latest_images() {
    log "INFO" "Pulling latest Docker images..."
    docker-compose -f "$COMPOSE_FILE" pull
}

build_application() {
    log "INFO" "Building application image..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache app
}

run_database_migrations() {
    log "INFO" "Running database migrations..."

    # Wait for database to be ready
    docker-compose -f "$COMPOSE_FILE" exec postgres pg_isready -U postgres -t 30

    # Run migrations
    docker-compose -f "$COMPOSE_FILE" run --rm app npm run db:migrate

    log "INFO" "Database migrations completed"
}

deploy_rolling() {
    log "INFO" "Starting rolling deployment..."

    # Scale up new instances
    log "INFO" "Scaling up new application instances..."
    docker-compose -f "$COMPOSE_FILE" up -d --scale app=4

    # Wait for new instances to be healthy
    sleep 30
    if ! check_service_health; then
        log "ERROR" "New instances failed health check"
        return 1
    fi

    # Scale down old instances gradually
    log "INFO" "Scaling down old instances..."
    docker-compose -f "$COMPOSE_FILE" up -d --scale app=2
    sleep 10
    docker-compose -f "$COMPOSE_FILE" up -d --scale app=2

    log "INFO" "Rolling deployment completed"
}

deploy_maintenance() {
    log "INFO" "Starting maintenance mode deployment..."

    # Enable maintenance mode
    # (This would typically involve setting a maintenance flag or serving a maintenance page)

    # Stop application services
    docker-compose -f "$COMPOSE_FILE" stop app

    # Deploy new version
    docker-compose -f "$COMPOSE_FILE" up -d

    # Wait for services to be ready
    if ! check_service_health; then
        log "ERROR" "Services failed health check after deployment"
        return 1
    fi

    # Disable maintenance mode
    log "INFO" "Maintenance mode deployment completed"
}

deploy_application() {
    case "$DEPLOYMENT_MODE" in
        "rolling")
            deploy_rolling
            ;;
        "maintenance")
            deploy_maintenance
            ;;
        *)
            log "ERROR" "Unknown deployment mode: $DEPLOYMENT_MODE"
            exit 1
            ;;
    esac
}

# =============================================================================
# ROLLBACK FUNCTIONS
# =============================================================================
rollback_deployment() {
    if [ "$ROLLBACK_ENABLED" = "true" ] && [ -f "$BACKUP_DIR/latest_backup" ]; then
        log "WARN" "Rolling back deployment..."

        local backup_name=$(cat "$BACKUP_DIR/latest_backup")

        # Stop current services
        docker-compose -f "$COMPOSE_FILE" down

        # Restore database
        if [ -f "$BACKUP_DIR/${backup_name}_db.sql.gz" ]; then
            log "INFO" "Restoring database from backup..."
            docker-compose -f "$COMPOSE_FILE" up -d postgres
            sleep 10

            gunzip < "$BACKUP_DIR/${backup_name}_db.sql.gz" | \
                docker-compose -f "$COMPOSE_FILE" exec -T postgres \
                psql -U postgres -d knowledge_foyer_prod
        fi

        # Restore application data
        if [ -f "$BACKUP_DIR/${backup_name}_data.tar.gz" ]; then
            log "INFO" "Restoring application data from backup..."
            docker-compose -f "$COMPOSE_FILE" run --rm app \
                tar xzf "$BACKUP_DIR/${backup_name}_data.tar.gz" -C /
        fi

        # Start services
        docker-compose -f "$COMPOSE_FILE" up -d

        log "INFO" "Rollback completed"
    else
        log "WARN" "Rollback not available or disabled"
    fi
}

# =============================================================================
# CLEANUP FUNCTIONS
# =============================================================================
cleanup_old_images() {
    log "INFO" "Cleaning up old Docker images..."
    docker image prune -f
    docker-compose -f "$COMPOSE_FILE" images -q | xargs -r docker rmi || true
}

cleanup_old_backups() {
    log "INFO" "Cleaning up old backups..."
    find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
}

# =============================================================================
# MONITORING FUNCTIONS
# =============================================================================
send_deployment_notification() {
    local status="$1"
    local webhook_url="${MONITORING_WEBHOOK_URL:-}"

    if [ -n "$webhook_url" ]; then
        local payload=$(cat <<EOF
{
    "text": "Knowledge Foyer Deployment $status",
    "fields": [
        {"title": "Environment", "value": "Production", "short": true},
        {"title": "Status", "value": "$status", "short": true},
        {"title": "Timestamp", "value": "$(date)", "short": false}
    ]
}
EOF
)
        curl -X POST -H "Content-Type: application/json" \
            -d "$payload" "$webhook_url" || true
    fi
}

# =============================================================================
# MAIN DEPLOYMENT FUNCTION
# =============================================================================
main() {
    local start_time=$(date +%s)

    log "INFO" "Starting Knowledge Foyer production deployment..."
    log "INFO" "Deployment mode: $DEPLOYMENT_MODE"

    # Pre-deployment checks
    check_dependencies
    check_environment
    check_disk_space

    # Create backup
    create_backup

    # Send start notification
    send_deployment_notification "STARTED"

    # Main deployment process
    if pull_latest_images && \
       build_application && \
       run_database_migrations && \
       deploy_application && \
       check_service_health; then

        # Deployment successful
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        log "INFO" "Deployment completed successfully in ${duration}s"
        send_deployment_notification "SUCCESS"

        # Cleanup
        cleanup_old_images
        cleanup_old_backups

    else
        # Deployment failed
        log "ERROR" "Deployment failed"
        send_deployment_notification "FAILED"

        # Attempt rollback
        if [ "$ROLLBACK_ENABLED" = "true" ]; then
            rollback_deployment
            send_deployment_notification "ROLLED_BACK"
        fi

        exit 1
    fi
}

# =============================================================================
# SCRIPT ENTRY POINT
# =============================================================================
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    setup_logging

    # Handle command line arguments
    case "${1:-deploy}" in
        "deploy")
            main
            ;;
        "rollback")
            rollback_deployment
            ;;
        "health")
            check_service_health
            ;;
        "backup")
            create_backup
            ;;
        "cleanup")
            cleanup_old_images
            cleanup_old_backups
            ;;
        *)
            echo "Usage: $0 {deploy|rollback|health|backup|cleanup}"
            exit 1
            ;;
    esac
fi