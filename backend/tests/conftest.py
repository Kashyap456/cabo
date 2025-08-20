# conftest.py
from app.core.database import Base  # your Declarative Base
import os
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from dotenv import load_dotenv

load_dotenv()

# Normalize URLs so all tests hit the same DB
os.environ.setdefault("DATABASE_URL", os.environ["TEST_DATABASE_URL"])
TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"]


@pytest_asyncio.fixture(scope="function")
async def async_session():
    # 1) Build a fresh engine for this test
    test_engine: AsyncEngine = create_async_engine(
        TEST_DATABASE_URL, echo=False, future=True)
    SessionLocal = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False)

    # 2) Create schema
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 3) Yield a session
    async with SessionLocal() as s:
        yield s

    # 4) Drop schema and dispose
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()
