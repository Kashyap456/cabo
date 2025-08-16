#!/bin/bash
set -a  # automatically export all variables
source .env
set +a

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Debug mode flag
DEBUG=false

# Parse debug flag before other arguments
PYTEST_ARGS=()
for arg in "$@"; do
    if [ "$arg" = "--debug" ]; then
        DEBUG=true
    else
        PYTEST_ARGS+=("$arg")
    fi
done

# Function to print colored output
print_status() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_debug() {
    if [ "$DEBUG" = true ]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Function to run command with optional debug output
run_command() {
    local cmd="$1"
    local description="$2"
    
    print_debug "Running: $cmd"
    
    if [ "$DEBUG" = true ]; then
        eval "$cmd"
    else
        eval "$cmd" > /dev/null 2>&1
    fi
    
    return $?
}

# Function to cleanup on exit
cleanup() {
    print_status "Cleaning up..."
    run_command "docker compose -p cabo_test -f docker-compose.test.yml down -v" "Stopping containers"
}

# Set up trap to ensure cleanup happens
trap cleanup EXIT

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "docker-compose is not installed or not in PATH"
    exit 1
fi

# Start database
print_status "Starting PostgreSQL database..."
run_command "docker compose -p cabo_test -f docker-compose.test.yml up -d --wait postgres_test" "Starting database"

if [ $? -ne 0 ]; then
    print_error "Failed to start database"
    exit 1
fi

# Run pytest with filtered arguments (excluding --debug)
print_status "Running tests..."
if [ "$DEBUG" = true ]; then
    print_debug "Running: pytest ${PYTEST_ARGS[*]}"
fi
DATABASE_URL=$TEST_DATABASE_URL uv run pytest "${PYTEST_ARGS[@]}"
test_exit_code=$?

# Check test results
if [ $test_exit_code -eq 0 ]; then
    print_status "All tests passed!"
else
    print_error "Some tests failed (exit code: $test_exit_code)"
fi

# Cleanup happens automatically via trap
exit $test_exit_code