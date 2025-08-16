import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+asyncpg://cabo_user:cabo_password@localhost:5433/cabo_db")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_maker() as session:
        yield session


async def check_database_connection() -> bool:
    """Check if database connection is working"""
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT 1"))
        print(res)
    return True
