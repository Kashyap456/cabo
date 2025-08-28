import asyncio
import logging
import time
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from typing import List, Set

from app.core.database import get_db
from app.models import GameRoom, UserToRoom, RoomPhase, GameCheckpoint
from services.redis_manager import redis_manager

logger = logging.getLogger(__name__)


class CleanupService:
    def __init__(self, cleanup_interval_seconds: int = 30, inactivity_threshold_minutes: float = 2.0):
        """
        Initialize cleanup service

        Args:
            cleanup_interval_seconds: How often to run cleanup (default 30 seconds)
            inactivity_threshold_minutes: How long before considering a room inactive (default 2 minutes)
        """
        self.cleanup_interval = cleanup_interval_seconds
        self.inactivity_threshold = timedelta(
            minutes=inactivity_threshold_minutes)
        self.is_running = False
        self._task = None
        self.connection_manager = None  # Will be set during startup

    async def cleanup_redis_data(self, room_ids: List[str], room_codes: List[str]) -> None:
        """
        Clean up Redis data for the given rooms

        Args:
            room_ids: List of room IDs to clean up
            room_codes: List of room codes to clean up
        """
        try:
            await redis_manager.ensure_connected()
            redis = redis_manager.redis

            for room_id in room_ids:
                # Clean up game state
                game_key = f"game:{room_id}"
                await redis.delete(game_key)

                # Clean up room data
                room_key = f"room:{room_id}"
                await redis.delete(room_key)

                # Clean up any stream data (check both formats)
                stream_key = f"stream:game:{room_id}"
                stream_events_key = f"stream:game:{room_id}:events"
                await redis.delete(stream_key, stream_events_key)

                # Clean up player states
                pattern = f"player:{room_id}:*"
                cursor = 0
                while True:
                    cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                    if keys:
                        await redis.delete(*keys)
                    if cursor == 0:
                        break

                # Clean up any pubsub channels (they auto-cleanup when no subscribers)
                # but we should remove any persistent channel data
                channel_key = f"channel:{room_id}"
                await redis.delete(channel_key)

                logger.debug(f"Cleaned up Redis data for room {room_id}")

            # Also clean up by room codes (in case they're used as keys)
            for room_code in room_codes:
                room_code_key = f"room:code:{room_code}"
                await redis.delete(room_code_key)

        except Exception as e:
            logger.error(f"Error cleaning up Redis data: {e}")

    async def get_inactive_room_ids_from_redis(self) -> Set[str]:
        """
        Check Redis for rooms that might be inactive based on stream activity
        Returns set of room IDs that appear inactive
        """
        inactive_rooms = set()
        try:
            await redis_manager.ensure_connected()
            redis = redis_manager.redis
            # Use time.time() to get proper UTC timestamp
            current_time_ms = int(time.time() * 1000)
            threshold_ms = current_time_ms - int(self.inactivity_threshold.total_seconds() * 1000)

            # Check all game streams for activity
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match="stream:game:*", count=100)

                for key in keys:
                    # Key is already a string due to decode_responses=True
                    # Get the last entry time from the stream
                    last_entry = await redis.xrevrange(key, count=1)

                    if last_entry:
                        # Entry ID format is "timestamp-sequence" (already a string)
                        last_timestamp_ms = int(last_entry[0][0].split('-')[0])
                        if last_timestamp_ms < threshold_ms:
                            # Extract room_id from key, handle the ":events" suffix if present
                            room_id = key.replace(
                                "stream:game:", "").replace(":events", "")
                            inactive_rooms.add(room_id)
                    else:
                        # Empty stream, consider it inactive
                        room_id = key.replace(
                            "stream:game:", "").replace(":events", "")
                        inactive_rooms.add(room_id)

                if cursor == 0:
                    break

        except Exception as e:
            logger.error(f"Error checking Redis for inactive rooms: {e}")

        return inactive_rooms

    async def cleanup_inactive_games(self, db: AsyncSession) -> int:
        """
        Remove games that haven't had activity in the threshold period
        Returns number of games cleaned up
        """
        try:
            threshold_time = datetime.utcnow() - self.inactivity_threshold

            # Find inactive rooms from PostgreSQL
            result = await db.execute(
                select(GameRoom)
                .options(selectinload(GameRoom.user_memberships))
                .where(GameRoom.last_activity < threshold_time)
            )
            inactive_rooms = result.scalars().all()

            # Also check Redis for potentially inactive rooms
            redis_inactive_room_ids = await self.get_inactive_room_ids_from_redis()
            
            # Add any Redis-inactive rooms to our cleanup list if they exist in DB
            for room_id in redis_inactive_room_ids:
                # Check if this room exists in PostgreSQL but wasn't in our inactive list
                if not any(str(room.room_id) == room_id for room in inactive_rooms):
                    room_result = await db.execute(
                        select(GameRoom)
                        .options(selectinload(GameRoom.user_memberships))
                        .where(GameRoom.room_id == room_id)
                    )
                    redis_inactive_room = room_result.scalar_one_or_none()
                    if redis_inactive_room:
                        logger.info(f"Found Redis-inactive room {redis_inactive_room.room_code} not caught by DB query")
                        inactive_rooms.append(redis_inactive_room)

            # Collect room IDs and codes for Redis cleanup
            room_ids_to_clean = []
            room_codes_to_clean = []

            cleaned_count = 0

            for room in inactive_rooms:
                # Log the cleanup
                logger.info(
                    f"Cleaning up inactive room {room.room_code} "
                    f"(last activity: {room.last_activity}, "
                    f"phase: {room.phase}, "
                    f"players: {len(room.user_memberships)})"
                )

                room_ids_to_clean.append(str(room.room_id))
                room_codes_to_clean.append(room.room_code)

                # Delete in correct order due to foreign key constraints
                # 1. Delete all user memberships
                await db.execute(
                    delete(UserToRoom).where(
                        UserToRoom.room_id == room.room_id)
                )

                # 2. Delete game checkpoints
                await db.execute(
                    delete(GameCheckpoint).where(
                        GameCheckpoint.room_id == room.room_id)
                )

                # 3. Finally delete the room
                await db.execute(
                    delete(GameRoom).where(GameRoom.room_id == room.room_id)
                )
                cleaned_count += 1

            # Clean up Redis data for inactive rooms
            if room_ids_to_clean:
                await self.cleanup_redis_data(room_ids_to_clean, room_codes_to_clean)

                # Also clean up connection manager's in-memory state for these rooms
                if self.connection_manager:
                    for room_id in room_ids_to_clean:
                        # Clean up room_connections
                        if room_id in self.connection_manager.room_connections:
                            logger.info(
                                f"Cleaning up stale connection manager state for room {room_id}")
                            del self.connection_manager.room_connections[room_id]

                        # Clean up connections that reference this room
                        connections_to_clean = []
                        for conn_id, conn_info in self.connection_manager.connections.items():
                            if conn_info.room_id == room_id:
                                connections_to_clean.append(conn_id)

                        for conn_id in connections_to_clean:
                            logger.debug(
                                f"Removing connection {conn_id} from cleaned room {room_id}")
                            if conn_id in self.connection_manager.connections:
                                session_id = self.connection_manager.connections[conn_id].session_id
                                del self.connection_manager.connections[conn_id]
                                # Also clean up session_to_connection mapping
                                if session_id in self.connection_manager.session_to_connection:
                                    del self.connection_manager.session_to_connection[session_id]
                            if conn_id in self.connection_manager.websockets:
                                del self.connection_manager.websockets[conn_id]
                            if conn_id in self.connection_manager.heartbeat_tasks:
                                self.connection_manager.heartbeat_tasks[conn_id].cancel(
                                )
                                del self.connection_manager.heartbeat_tasks[conn_id]

            # Clean up any orphaned Redis data (rooms that don't exist in DB at all)
            for room_id in redis_inactive_room_ids:
                if room_id not in room_ids_to_clean:
                    # This means the room doesn't exist in PostgreSQL at all
                    logger.info(f"Cleaning up orphaned Redis data for non-existent room {room_id}")
                    
                    # Just clean up Redis data (no DB records to delete)
                    await self.cleanup_redis_data([room_id], [])
                    
                    # Clean up connection manager state for orphaned rooms too
                    if self.connection_manager and room_id in self.connection_manager.room_connections:
                        logger.info(f"Cleaning up orphaned connection manager state for room {room_id}")
                        del self.connection_manager.room_connections[room_id]

            if cleaned_count > 0:
                await db.commit()
                logger.info(
                    f"Cleaned up {cleaned_count} inactive games (DB + Redis)")

            return cleaned_count

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            await db.rollback()
            return 0

    async def _cleanup_loop(self):
        """Background task that runs cleanup periodically"""
        logger.info(
            f"Starting cleanup service (interval: {self.cleanup_interval}s, "
            f"threshold: {self.inactivity_threshold.total_seconds()/60:.1f} minutes)"
        )

        while self.is_running:
            try:
                # Get a new database session for this cleanup run
                async for db in get_db():
                    cleaned = await self.cleanup_inactive_games(db)
                    if cleaned > 0:
                        logger.debug(
                            f"Cleanup cycle completed: {cleaned} games removed")
                    break

            except Exception as e:
                logger.error(f"Cleanup cycle failed: {e}")

            # Wait for next cleanup cycle
            await asyncio.sleep(self.cleanup_interval)

    def set_connection_manager(self, connection_manager):
        """Set the connection manager instance"""
        self.connection_manager = connection_manager
        logger.info("Connection manager set for cleanup service")

    def start(self):
        """Start the cleanup service"""
        if not self.is_running:
            self.is_running = True
            self._task = asyncio.create_task(self._cleanup_loop())
            logger.info("Cleanup service started")

    def stop(self):
        """Stop the cleanup service"""
        if self.is_running:
            self.is_running = False
            if self._task:
                self._task.cancel()
            logger.info("Cleanup service stopped")


# Global instance
cleanup_service = CleanupService(
    cleanup_interval_seconds=120,  # Check every 2 minutes
    inactivity_threshold_minutes=10.0  # Clean up games inactive for 10+ minutes
)
