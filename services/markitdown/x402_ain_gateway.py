"""
x402 AIN Gateway — token holder verification for A2A agents.
No transfers required. Verifies AIN token balance on Base network.
"""

import os
import httpx
from eth_utils import to_checksum_address
from fastapi import Request, HTTPException

# AIN token on Base
AIN_TOKEN_BASE = "0xd4423795fd904d9b87554940a95fb7016f172773"
BASE_RPC_URL = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
BASE_SEPOLIA_RPC_URL = os.getenv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org")

# Minimum AIN balance required (in wei, 18 decimals)
# Default: 1 AIN = 1e18 wei
MIN_AIN_BALANCE = int(os.getenv("MIN_AIN_BALANCE", str(10 ** 18)))

# Use testnet by default for development
USE_TESTNET = os.getenv("USE_TESTNET", "true").lower() == "true"

# ERC-20 balanceOf(address) function selector
BALANCE_OF_SELECTOR = "0x70a08231"


async def check_ain_balance(address: str) -> int:
    """Check AIN token balance on Base network."""
    rpc_url = BASE_SEPOLIA_RPC_URL if USE_TESTNET else BASE_RPC_URL
    checksum_addr = to_checksum_address(address)

    # Encode balanceOf(address) call
    # Pad address to 32 bytes
    padded_address = checksum_addr[2:].lower().zfill(64)
    data = f"{BALANCE_OF_SELECTOR}{padded_address}"

    payload = {
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [
            {
                "to": AIN_TOKEN_BASE,
                "data": data,
            },
            "latest",
        ],
        "id": 1,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(rpc_url, json=payload)
        resp.raise_for_status()
        result = resp.json()

    if "error" in result:
        raise Exception(f"RPC error: {result['error']}")

    hex_balance = result.get("result", "0x0")
    return int(hex_balance, 16)


def format_ain_amount(wei: int) -> str:
    """Format wei to human-readable AIN amount."""
    ain = wei / (10 ** 18)
    if ain >= 1000:
        return f"{ain:,.0f} AIN"
    elif ain >= 1:
        return f"{ain:.2f} AIN"
    else:
        return f"{ain:.6f} AIN"


async def verify_ain_holder(address: str) -> dict:
    """
    Verify that an address holds enough AIN on Base.
    Returns verification result.
    """
    try:
        balance = await check_ain_balance(address)
        is_holder = balance >= MIN_AIN_BALANCE

        return {
            "verified": is_holder,
            "address": address,
            "balance": format_ain_amount(balance),
            "balance_wei": str(balance),
            "required": format_ain_amount(MIN_AIN_BALANCE),
            "network": "base-sepolia" if USE_TESTNET else "base",
            "token": AIN_TOKEN_BASE,
        }
    except Exception as e:
        return {
            "verified": False,
            "address": address,
            "error": str(e),
        }


def create_payment_required_response(address: str | None = None) -> dict:
    """Create a 402 PaymentRequired response in x402 format."""
    return {
        "type": "x402",
        "status": "payment-required",
        "message": "AIN token holder verification required",
        "requirements": {
            "type": "token-balance",
            "token": AIN_TOKEN_BASE,
            "network": "base-sepolia" if USE_TESTNET else "base",
            "minimum_balance": str(MIN_AIN_BALANCE),
            "minimum_human": format_ain_amount(MIN_AIN_BALANCE),
            "description": "Hold AIN tokens on Base network to access this service",
        },
        "address_checked": address,
    }


async def ain_holder_middleware(request: Request):
    """
    FastAPI middleware/dependency that checks AIN holder status.
    Pass wallet address via X-Wallet-Address header or query param.
    """
    address = (
        request.headers.get("X-Wallet-Address")
        or request.query_params.get("wallet")
    )

    if not address:
        raise HTTPException(
            status_code=402,
            detail=create_payment_required_response(),
        )

    try:
        checksum = to_checksum_address(address)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail={"error": "Invalid wallet address"},
        )

    result = await verify_ain_holder(checksum)

    if not result["verified"]:
        raise HTTPException(
            status_code=402,
            detail=create_payment_required_response(checksum),
        )

    return result
