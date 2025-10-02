#!/bin/bash

# =====================================================================================
# FLUXION AI - STOP SCRIPT
# Script para detener frontend y backend fácilmente
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
LOG_DIR=".fluxion"
BACKEND_PORT=${BACKEND_PORT:-3004}
FRONTEND_PORT=${FRONTEND_PORT:-3000}

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
    echo "║                FLUXION AI - STOP SCRIPT                ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to kill process by PID file
kill_by_pid_file() {
    local service_name=$1
    local pid_file="$LOG_DIR/${service_name}.pid"

    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            print_info "Stopping $service_name (PID: $pid)..."
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2

            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "Force killing $service_name..."
                kill -9 "$pid" 2>/dev/null || true
            fi

            print_success "$service_name stopped"
        else
            print_warning "$service_name was not running (PID: $pid)"
        fi
        rm -f "$pid_file"
    else
        print_warning "No PID file found for $service_name"
    fi
}

# Function to kill process on port
kill_by_port() {
    local port=$1
    local service_name=$2

    if command_exists lsof; then
        local pids=$(lsof -t -i:$port 2>/dev/null || true)
        if [[ -n "$pids" ]]; then
            print_info "Killing processes on port $port ($service_name)..."
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 2

            # Force kill if still running
            local remaining_pids=$(lsof -t -i:$port 2>/dev/null || true)
            if [[ -n "$remaining_pids" ]]; then
                print_warning "Force killing remaining processes on port $port..."
                echo "$remaining_pids" | xargs kill -9 2>/dev/null || true
            fi

            print_success "Processes on port $port stopped"
        fi
    elif command_exists netstat; then
        print_warning "Using netstat method - may need manual cleanup"
        # This is less reliable but works when lsof is not available
        local pids=$(netstat -tulpn 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | grep -v '-' || true)
        if [[ -n "$pids" ]]; then
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 2
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
    fi
}

# Function to stop Docker containers
stop_docker_services() {
    if command_exists docker; then
        print_info "Stopping Docker services..."

        # Stop PostgreSQL container
        if docker ps -q --filter "name=fluxion-postgres" | grep -q .; then
            print_info "Stopping PostgreSQL container..."
            docker stop fluxion-postgres >/dev/null 2>&1 || true
            docker rm fluxion-postgres >/dev/null 2>&1 || true
            print_success "PostgreSQL container stopped"
        fi

        # Stop Redis container
        if docker ps -q --filter "name=fluxion-redis" | grep -q .; then
            print_info "Stopping Redis container..."
            docker stop fluxion-redis >/dev/null 2>&1 || true
            docker rm fluxion-redis >/dev/null 2>&1 || true
            print_success "Redis container stopped"
        fi
    fi
}

# Function to clean up log files
clean_logs() {
    if [[ -d "$LOG_DIR" ]]; then
        print_info "Cleaning up log files..."
        rm -f "$LOG_DIR"/*.log
        print_success "Log files cleaned"
    fi
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -b, --backend-only      Stop only backend service"
    echo "  -f, --frontend-only     Stop only frontend service"
    echo "  -p, --backend-port PORT Backend port to stop (default: 3004)"
    echo "  -P, --frontend-port PORT Frontend port to stop (default: 3000)"
    echo "  --no-db                 Skip stopping database services"
    echo "  --clean-logs            Remove log files after stopping"
    echo "  --force                 Force kill all related processes"
    echo ""
    echo "Examples:"
    echo "  $0                      Stop all services"
    echo "  $0 --backend-only       Stop only backend"
    echo "  $0 --clean-logs         Stop services and clean logs"
    echo "  $0 --force              Force stop all processes"
}

# Parse command line arguments
BACKEND_ONLY=false
FRONTEND_ONLY=false
SKIP_DB=false
CLEAN_LOGS=false
FORCE=false

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
        --clean-logs)
            CLEAN_LOGS=true
            shift
            ;;
        --force)
            FORCE=true
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

    # Stop services based on options
    if [[ "$FRONTEND_ONLY" == true ]]; then
        print_info "Stopping frontend only..."
        kill_by_pid_file "frontend"
        kill_by_port $FRONTEND_PORT "frontend"
    elif [[ "$BACKEND_ONLY" == true ]]; then
        print_info "Stopping backend only..."
        kill_by_pid_file "backend"
        kill_by_port $BACKEND_PORT "backend"
    else
        print_info "Stopping all Fluxion AI services..."

        # Stop backend
        kill_by_pid_file "backend"
        kill_by_port $BACKEND_PORT "backend"

        # Stop frontend
        kill_by_pid_file "frontend"
        kill_by_port $FRONTEND_PORT "frontend"
    fi

    # Stop database services unless skipped
    if [[ "$SKIP_DB" != true ]]; then
        stop_docker_services
    fi

    # Force mode - kill any remaining node processes
    if [[ "$FORCE" == true ]]; then
        print_warning "Force mode: killing all node processes..."
        pkill -f "node.*fluxion" 2>/dev/null || true
        pkill -f "npm.*dev" 2>/dev/null || true
        print_success "Force cleanup completed"
    fi

    # Clean logs if requested
    if [[ "$CLEAN_LOGS" == true ]]; then
        clean_logs
    fi

    print_success "🛑 Fluxion AI services stopped"

    # Show any remaining processes
    if command_exists lsof; then
        local remaining=$(lsof -i :$BACKEND_PORT,:$FRONTEND_PORT 2>/dev/null | grep LISTEN || true)
        if [[ -n "$remaining" ]]; then
            print_warning "Some processes may still be running:"
            echo "$remaining"
        fi
    fi
}

# Run main function
main