#!/bin/bash

# Knowledge Foyer Nginx Setup Script
# This script helps set up nginx for development testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"
SITE_NAME="knowledgefoyer"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
}

check_nginx() {
    if ! command -v nginx &> /dev/null; then
        error "nginx is not installed. Install it with:"
        echo "  Ubuntu/Debian: sudo apt-get install nginx"
        echo "  macOS: brew install nginx"
        exit 1
    fi
    success "nginx is installed"
}

check_permissions() {
    if [[ $EUID -ne 0 ]] && [[ "$1" != "test" ]] && [[ "$1" != "status" ]]; then
        error "This script needs to be run with sudo for nginx configuration"
        echo "Usage: sudo $0 {install|remove|reload|test|status}"
        exit 1
    fi
}

install_config() {
    log "Installing nginx configuration for Knowledge Foyer..."

    # Copy configuration file
    cp "$SCRIPT_DIR/knowledgefoyer.conf" "$NGINX_CONF_DIR/$SITE_NAME"
    success "Configuration file copied to $NGINX_CONF_DIR/$SITE_NAME"

    # Create symbolic link to enable the site
    if [[ ! -L "$NGINX_ENABLED_DIR/$SITE_NAME" ]]; then
        ln -s "$NGINX_CONF_DIR/$SITE_NAME" "$NGINX_ENABLED_DIR/$SITE_NAME"
        success "Site enabled in $NGINX_ENABLED_DIR"
    else
        warning "Site already enabled"
    fi

    # Test configuration
    if nginx -t; then
        success "nginx configuration test passed"
        systemctl reload nginx
        success "nginx reloaded"
    else
        error "nginx configuration test failed"
        exit 1
    fi

    log "nginx is now configured for Knowledge Foyer"
    echo ""
    echo "🌐 Your application will be available at:"
    echo "   Main site: http://localhost"
    echo "   User pages: http://username.localhost"
    echo "   API: http://localhost/api"
    echo "   Health: http://localhost/health"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Start your Knowledge Foyer app: npm run dev"
    echo "   2. Test the setup: $0 test"
}

remove_config() {
    log "Removing nginx configuration for Knowledge Foyer..."

    # Remove enabled site
    if [[ -L "$NGINX_ENABLED_DIR/$SITE_NAME" ]]; then
        rm "$NGINX_ENABLED_DIR/$SITE_NAME"
        success "Removed enabled site link"
    fi

    # Remove configuration file
    if [[ -f "$NGINX_CONF_DIR/$SITE_NAME" ]]; then
        rm "$NGINX_CONF_DIR/$SITE_NAME"
        success "Removed configuration file"
    fi

    # Reload nginx
    systemctl reload nginx
    success "nginx reloaded"

    log "Knowledge Foyer nginx configuration removed"
}

test_setup() {
    log "Testing Knowledge Foyer nginx setup..."

    # Check if nginx is running
    if ! systemctl is-active --quiet nginx; then
        error "nginx is not running. Start it with: sudo systemctl start nginx"
        exit 1
    fi
    success "nginx is running"

    # Check if configuration file exists
    if [[ ! -f "$NGINX_CONF_DIR/$SITE_NAME" ]]; then
        error "Configuration file not found. Run: sudo $0 install"
        exit 1
    fi
    success "Configuration file exists"

    # Check if site is enabled
    if [[ ! -L "$NGINX_ENABLED_DIR/$SITE_NAME" ]]; then
        error "Site not enabled. Run: sudo $0 install"
        exit 1
    fi
    success "Site is enabled"

    # Test nginx configuration
    if ! nginx -t &>/dev/null; then
        error "nginx configuration test failed"
        nginx -t
        exit 1
    fi
    success "nginx configuration is valid"

    # Test if Knowledge Foyer app is running
    if curl -s --connect-timeout 5 http://localhost:8000/health >/dev/null; then
        success "Knowledge Foyer app is responding on port 8000"
    else
        warning "Knowledge Foyer app is not responding on port 8000"
        echo "   Start it with: npm run dev"
    fi

    # Test if WebSocket server is running
    if curl -s --connect-timeout 5 http://localhost:8001 >/dev/null 2>&1; then
        success "WebSocket server is responding on port 8001"
    else
        warning "WebSocket server is not responding on port 8001"
    fi

    # Test proxy
    log "Testing proxy connections..."

    if curl -s --connect-timeout 5 http://localhost/health >/dev/null; then
        success "nginx proxy to app is working"
    else
        warning "nginx proxy to app is not working"
    fi

    if curl -s --connect-timeout 5 http://localhost/api >/dev/null; then
        success "API endpoint is accessible through nginx"
    else
        warning "API endpoint is not accessible through nginx"
    fi

    # Test subdomain
    if curl -s --connect-timeout 5 -H "Host: testuser.localhost" http://localhost/ >/dev/null; then
        success "Subdomain routing is working"
    else
        warning "Subdomain routing is not working"
    fi

    log "Test completed!"
    echo ""
    echo "🔗 Test these URLs:"
    echo "   curl http://localhost/health"
    echo "   curl http://localhost/api"
    echo "   curl -H \"Host: testuser.localhost\" http://localhost/"
}

show_status() {
    log "Knowledge Foyer nginx status:"
    echo ""

    # nginx status
    if systemctl is-active --quiet nginx; then
        success "nginx is running"
    else
        error "nginx is not running"
    fi

    # Configuration file
    if [[ -f "$NGINX_CONF_DIR/$SITE_NAME" ]]; then
        success "Configuration file exists"
    else
        error "Configuration file missing"
    fi

    # Site enabled
    if [[ -L "$NGINX_ENABLED_DIR/$SITE_NAME" ]]; then
        success "Site is enabled"
    else
        error "Site is not enabled"
    fi

    # App status
    if curl -s --connect-timeout 2 http://localhost:8000/health >/dev/null; then
        success "Knowledge Foyer app is running (port 8000)"
    else
        warning "Knowledge Foyer app is not running (port 8000)"
    fi

    if curl -s --connect-timeout 2 http://localhost:8001 >/dev/null 2>&1; then
        success "WebSocket server is running (port 8001)"
    else
        warning "WebSocket server is not running (port 8001)"
    fi
}

case "$1" in
    install)
        check_nginx
        check_permissions "$1"
        install_config
        ;;
    remove)
        check_permissions "$1"
        remove_config
        ;;
    reload)
        check_permissions "$1"
        systemctl reload nginx
        success "nginx reloaded"
        ;;
    test)
        test_setup
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {install|remove|reload|test|status}"
        echo ""
        echo "Commands:"
        echo "  install  - Install nginx configuration (requires sudo)"
        echo "  remove   - Remove nginx configuration (requires sudo)"
        echo "  reload   - Reload nginx configuration (requires sudo)"
        echo "  test     - Test the current setup"
        echo "  status   - Show status of nginx and app"
        echo ""
        echo "Example development workflow:"
        echo "  1. sudo $0 install"
        echo "  2. npm run dev (in another terminal)"
        echo "  3. $0 test"
        exit 1
        ;;
esac