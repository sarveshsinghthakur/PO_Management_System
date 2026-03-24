"""Pydantic schemas for request/response validation."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# ── Vendor Schemas ──────────────────────────────────────────────
class VendorCreate(BaseModel):
    name: str
    contact: str
    rating: Optional[float] = 0.0

class VendorResponse(BaseModel):
    id: int
    name: str
    contact: str
    rating: float

    class Config:
        from_attributes = True


# ── Product Schemas ─────────────────────────────────────────────
class ProductCreate(BaseModel):
    name: str
    sku: str
    unit_price: float
    stock_level: Optional[int] = 0

class ProductResponse(BaseModel):
    id: int
    name: str
    sku: str
    unit_price: float
    stock_level: int

    class Config:
        from_attributes = True


# ── Purchase Order Item Schemas ─────────────────────────────────
class POItemCreate(BaseModel):
    product_id: int
    quantity: int

class POItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    quantity: int
    unit_price: float
    line_total: float

    class Config:
        from_attributes = True


# ── Purchase Order Schemas ──────────────────────────────────────
class PurchaseOrderCreate(BaseModel):
    vendor_id: int
    items: List[POItemCreate]

class StatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(Draft|Confirmed|Received|Cancelled)$")

class PurchaseOrderResponse(BaseModel):
    id: int
    reference_no: str
    vendor_id: int
    vendor_name: Optional[str] = None
    total_amount: float
    subtotal: Optional[float] = None
    tax_amount: Optional[float] = None
    status: str
    created_at: datetime
    items: List[POItemResponse] = []

    class Config:
        from_attributes = True
