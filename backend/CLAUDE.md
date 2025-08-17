# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a FastAPI backend for a "Cabo" card game application. The project uses:

- **FastAPI** for the web framework
- **SQLAlchemy** with async support for database ORM
- **Alembic** for database migrations
- **asyncpg** for PostgreSQL async driver
- **WebSockets** for real-time game communication
- **uv** as the Python package manager
- **Docker Compose** for PostgreSQL database infrastructure
- **python-dotenv** for environment variable management

## Development Commands

When running any python command, prefix the command with "uv run" in order to use the virtual environment.

### Environment Setup

```bash
# Install dependencies
uv sync

# Activate virtual environment (if needed)
source .venv/bin/activate

# Start PostgreSQL database
docker-compose up -d postgres

# Stop database
docker-compose down
```

### Database Operations

```bash
# Create a new migration
alembic revision --autogenerate -m "migration description"

# Run migrations
alembic upgrade head

# Downgrade one migration
alembic downgrade -1
```

### Running the Application

```bash
# Development server
uvicorn app.main:app --reload

# Production server
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Testing

```bash
# Run all tests (automatically starts/stops database)
./test.sh

# Run tests with verbose output
./test.sh -v

# Run specific test file
./test.sh tests/test_health_check.py

# Run tests with filtering
./test.sh -k "health_check"

# Run tests and see coverage
./test.sh --cov=app

# Debug mode (shows docker-compose and command outputs)
./test.sh --debug
./test.sh --debug -v tests/test_health_check.py

# Manual testing (requires starting database separately)
docker-compose up -d postgres
pytest
docker-compose down
```

**Debug Mode**: Use `--debug` flag to see detailed output from docker-compose commands and other operations. This is helpful for troubleshooting database startup issues or understanding what the script is doing.

## Architecture

### Core Structure

- **`app/`** - Main FastAPI application

  - `main.py` - FastAPI app initialization with health check endpoint
  - `core/` - Core application utilities
    - `database.py` - Database connection and health check utilities
  - `routers/` - API route handlers
    - `game.py` - Game-related endpoints (empty template)
    - `ws.py` - WebSocket endpoints for real-time communication
  - `models/` - Database models (directory exists but empty)

- **`tests/`** - Test suite using pytest

  - `test_health_check.py` - Health check endpoint tests

- **`services/`** - Business logic layer

  - `game_manager.py` - Game state and logic management (empty template)
  - `room_manager.py` - Room/lobby management (empty template)

- **`alembic/`** - Database migration management
  - `env.py` - Alembic configuration with async support
  - `versions/` - Migration files

### Current State

This appears to be a newly initialized project with basic structure in place but minimal implementation. Most core files contain only basic templates or are empty.

### Key Patterns

- Uses async/await throughout for database and WebSocket operations
- Follows FastAPI router pattern for organizing endpoints
- Separates business logic into dedicated service modules
- Database operations configured for async PostgreSQL via asyncpg

## Database Configuration

The project uses Alembic with async SQLAlchemy and Docker Compose for PostgreSQL. Database configuration is managed through environment variables in the `.env` file:

- **POSTGRES_DB**: Database name (default: cabo_db)
- **POSTGRES_USER**: Database user (default: cabo_user)
- **POSTGRES_PASSWORD**: Database password (default: cabo_password)
- **POSTGRES_HOST**: Database host (default: localhost)
- **POSTGRES_PORT**: Database port (default: 5432)
- **DATABASE_URL**: Full connection string used by Alembic and SQLAlchemy

The PostgreSQL container uses a persistent volume (`pgdata`) to retain data between container restarts. Alembic is configured to automatically load the `DATABASE_URL` from environment variables.

## Cabo Game Rules

### Game Setup

- Players start with 4 cards facedown, and can choose two of them to view.
- An arbitrary player is chosen to start the game, and play continues clockwise.

### Gameplay

- At the start of a player's turn, they draw a card from the deck.
- They can either play that card, or replace one of their facedown cards with it, and then play the facedown card.
- Some cards have special effects that trigger upon being played.
- Once a card has been played, other players can call STACK.
  - The player who called STACK can then choose one of their cards to play. If the card matches the rank of the played card, they successfully stack (discard the played card). If the card does not match, the player keeps their chosen card and must draw a card.
  - A player can also call STACK on an opponent's card. If the card matches the rank of the played card, the opponent's card is discarded, and the player who called STACK can choose one of their cards to give to the opponent.
- Before drawing a card, a player can choose to call "Cabo"
  - That player does not take a turn, and their cards cannot be affected by STACK or any other card effects until the game ends.
  - One more round is played, and once play returns to the player who called Cabo, the game ends.

### Special Card Effects

- 7/8: You can choose one of your facedown cards to view.
- 9/10: You can choose another player's facedown card to view.
- J/Q: You can swap one of your facedown cards with another player's facedown card.
- K: You can look at any card on the board, and can then choose to swap it with one of your facedown cards.

### Scoring

- The player with the lowest sum of card values wins.
- Aces are worth 1 point, 2s are worth 2 points, 3s are worth 3 points, etc.
- Red Kings are worth -1 point, and Jokers are worth 0 points.

## Game Implementation Notes

### Miscellaneous

- Cards are stored in "reverse" order-- the end of the list is the top of the deck.
