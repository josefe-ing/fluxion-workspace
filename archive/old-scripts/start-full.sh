#!/bin/bash

# =====================================================================================
# FLUXION AI - START SCRIPT
# Script para levantar frontend y backend fácilmente
# =====================================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="services/backend"
FRONTEND_DIR="services/frontend"
BACKEND_PORT=${BACKEND_PORT:-3004}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
LOG_DIR=".fluxion"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo -e "${PURPLE}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                FLUXION AI - START SCRIPT               ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if port is available
is_port_available() {
    local port=$1
    if command_exists lsof; then
        ! lsof -i :$port >/dev/null 2>&1
    else
        ! netstat -an | grep -q ":$port "
    fi
}

# Function to kill process on port
kill_port() {
    local port=$1
    if command_exists lsof; then
        local pid=$(lsof -t -i:$port 2>/dev/null)
        if [[ -n "$pid" ]]; then
            print_warning "Killing process on port $port (PID: $pid)"
            kill -9 $pid 2>/dev/null || true
            sleep 1
        fi
    fi
}

# Function to check dependencies
check_dependencies() {
    print_info "Checking dependencies..."

    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi

    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi

    print_success "Node.js $(node --version) and npm $(npm --version) found"
}

# Function to install dependencies if needed
install_dependencies() {
    print_info "Checking and installing dependencies..."

    # Backend dependencies
    if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
        print_info "Installing backend dependencies..."
        cd "$BACKEND_DIR"
        npm install
        cd - > /dev/null
        print_success "Backend dependencies installed"
    fi

    # Frontend dependencies
    if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
        print_info "Installing frontend dependencies..."
        cd "$FRONTEND_DIR"
        npm install
        cd - > /dev/null
        print_success "Frontend dependencies installed"
    fi
}

# Function to setup log directory
setup_logs() {
    mkdir -p "$LOG_DIR"
    print_info "Logs will be saved to $LOG_DIR/"
}

# Function to start database services
start_database_services() {
    print_info "Starting database services..."

    # Check if Docker is available
    if command_exists docker; then
        # Start PostgreSQL
        if ! docker ps | grep -q postgres; then
            print_info "Starting PostgreSQL container..."
            docker run -d \
                --name fluxion-postgres \
                -e POSTGRES_USER=fluxion \
                -e POSTGRES_PASSWORD=fluxion123 \
                -e POSTGRES_DB=fluxion \
                -p 5432:5432 \
                postgres:15-alpine >/dev/null 2>&1 || true
        fi

        # Start Redis
        if ! docker ps | grep -q redis; then
            print_info "Starting Redis container..."
            docker run -d \
                --name fluxion-redis \
                -p 6379:6379 \
                redis:7-alpine >/dev/null 2>&1 || true
        fi

        print_success "Database services started"
    else
        print_warning "Docker not found. Database services may need to be started manually."
    fi
}

# Function to start backend
start_backend() {
    print_info "Starting backend on port $BACKEND_PORT..."

    # Kill any existing process on backend port
    kill_port $BACKEND_PORT

    cd "$BACKEND_DIR"

    # Set environment variables
    export DB_USER=jose
    export BACKEND_PORT=$BACKEND_PORT

    # Start backend in background
    nohup npm run dev > "../$LOG_DIR/backend.log" 2>&1 &
    local backend_pid=$!
    echo $backend_pid > "../$LOG_DIR/backend.pid"

    cd - > /dev/null

    # Wait a moment and check if backend started
    sleep 3
    if kill -0 $backend_pid 2>/dev/null; then
        print_success "Backend started (PID: $backend_pid)"
        print_info "Backend logs: tail -f $LOG_DIR/backend.log"
    else
        print_error "Failed to start backend"
        return 1
    fi
}

# Function to start frontend
start_frontend() {
    print_info "Starting frontend on port $FRONTEND_PORT..."

    # Kill any existing process on frontend port
    kill_port $FRONTEND_PORT

    cd "$FRONTEND_DIR"

    # Start frontend in background
    nohup npm run dev > "../$LOG_DIR/frontend.log" 2>&1 &
    local frontend_pid=$!
    echo $frontend_pid > "../$LOG_DIR/frontend.pid"

    cd - > /dev/null

    # Wait a moment and check if frontend started
    sleep 3
    if kill -0 $frontend_pid 2>/dev/null; then
        print_success "Frontend started (PID: $frontend_pid)"
        print_info "Frontend logs: tail -f $LOG_DIR/frontend.log"
    else
        print_error "Failed to start frontend"
        return 1
    fi
}

# Function to show running services
show_services() {
    echo ""
    print_success "🚀 Fluxion AI is now running!"
    echo ""
    echo -e "${GREEN}📊 Frontend:${NC}  http://localhost:$FRONTEND_PORT"
    echo -e "${GREEN}🔧 Backend:${NC}   http://localhost:$BACKEND_PORT"
    echo -e "${GREEN}🗄️  Database:${NC}  postgresql://localhost:5432/fluxion"
    echo -e "${GREEN}📦 Redis:${NC}     redis://localhost:6379"
    echo ""
    print_info "View logs:"
    echo "  Backend:  tail -f $LOG_DIR/backend.log"
    echo "  Frontend: tail -f $LOG_DIR/frontend.log"
    echo ""
    print_info "Stop services: ./stop.sh or make stop"
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -b, --backend-only      Start only backend service"
    echo "  -f, --frontend-only     Start only frontend service"
    echo "  -p, --backend-port PORT Set backend port (default: 3004)"
    echo "  -P, --frontend-port PORT Set frontend port (default: 3000)"
    echo "  --no-db                 Skip database services"
    echo "  --clean                 Clean logs and PIDs before starting"
    echo ""
    echo "Examples:"
    echo "  $0                      Start all services"
    echo "  $0 --backend-only       Start only backend"
    echo "  $0 -p 3005             Start with backend on port 3005"
    echo "  $0 --clean             Clean start (remove logs and PIDs)"
}

# Parse command line arguments
BACKEND_ONLY=false
FRONTEND_ONLY=false
SKIP_DB=false
CLEAN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -b|--backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        -f|--frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        -p|--backend-port)
            BACKEND_PORT="$2"
            shift 2
            ;;
        -P|--frontend-port)
            FRONTEND_PORT="$2"
            shift 2
            ;;
        --no-db)
            SKIP_DB=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
main() {
    print_header

    # Clean if requested
    if [[ "$CLEAN" == true ]]; then
        print_info "Cleaning previous runs..."
        rm -rf "$LOG_DIR"/*.log "$LOG_DIR"/*.pid
    fi

    # Check dependencies
    check_dependencies

    # Setup
    setup_logs
    install_dependencies

    # Start database services unless skipped
    if [[ "$SKIP_DB" != true ]]; then
        start_database_services
    fi

    # Start services based on options
    if [[ "$FRONTEND_ONLY" == true ]]; then
        start_frontend
    elif [[ "$BACKEND_ONLY" == true ]]; then
        start_backend
    else
        start_backend
        start_frontend
    fi

    # Show running services
    show_services
}

# Trap to handle script interruption
trap 'print_warning "Script interrupted. You may need to run ./stop.sh to clean up."' INT

# Run main function
main