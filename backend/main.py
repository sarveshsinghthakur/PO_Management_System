"""
Purchase Order Management System - FastAPI Backend
===================================================
RESTful API with Vendors, Products, Purchase Orders, PDF Invoice generation,
and Inventory Control (auto-update stock on PO received).
"""
import io
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session, joinedload
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from database import engine, get_db, Base
from models import Vendor, Product, PurchaseOrder, PurchaseOrderItem
from schemas import (
    VendorCreate, VendorResponse,
    ProductCreate, ProductResponse,
    PurchaseOrderCreate, PurchaseOrderResponse,
    POItemResponse, StatusUpdate,
)

# ── Create tables ───────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

# ── Frontend directory ──────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ── Lifespan (seed data on startup) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Seed sample vendors and products if the DB is empty."""
    db = next(get_db())
    try:
        if db.query(Vendor).count() == 0:
            vendors = [
                Vendor(name="Acme Supplies", contact="acme@example.com", rating=4.5),
                Vendor(name="Global Parts Inc.", contact="globalparts@example.com", rating=4.2),
                Vendor(name="TechSource Ltd.", contact="techsource@example.com", rating=4.8),
                Vendor(name="Industrial Mart", contact="indmart@example.com", rating=3.9),
            ]
            db.add_all(vendors)
            db.commit()

        if db.query(Product).count() == 0:
            products = [
                Product(name="Steel Bolts (100pc)", sku="STL-BLT-100", unit_price=12.50, stock_level=500),
                Product(name="Copper Wire (50m)", sku="COP-WIR-50", unit_price=45.00, stock_level=200),
                Product(name="Circuit Board v2", sku="CIR-BRD-V2", unit_price=89.99, stock_level=150),
                Product(name="LED Panel 24W", sku="LED-PNL-24", unit_price=34.75, stock_level=320),
                Product(name="Hydraulic Pump HP-3", sku="HYD-PMP-03", unit_price=250.00, stock_level=40),
                Product(name="Rubber Gasket Set", sku="RUB-GSK-ST", unit_price=8.25, stock_level=1000),
            ]
            db.add_all(products)
            db.commit()
    finally:
        db.close()
    yield


# ── FastAPI App ─────────────────────────────────────────────────
app = FastAPI(
    title="PO Management System",
    description="Purchase Order Management with Inventory Control",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TAX_RATE = 0.05  # 5 % tax


# ═══════════════════════════════════════════════════════════════
# HELPER: Calculate Total
# ═══════════════════════════════════════════════════════════════
def calculate_total(items: list) -> tuple:
    """Calculate subtotal, tax, and total for a list of order items."""
    subtotal = sum(item.line_total for item in items)
    tax = round(subtotal * TAX_RATE, 2)
    total = round(subtotal + tax, 2)
    return subtotal, tax, total


# ═══════════════════════════════════════════════════════════════
# SERVE FRONTEND
# ═══════════════════════════════════════════════════════════════
@app.get("/")
async def serve_frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ═══════════════════════════════════════════════════════════════
# VENDOR ENDPOINTS
# ═══════════════════════════════════════════════════════════════
@app.get("/api/vendors", response_model=list[VendorResponse])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(Vendor).all()


@app.post("/api/vendors", response_model=VendorResponse, status_code=201)
def create_vendor(data: VendorCreate, db: Session = Depends(get_db)):
    vendor = Vendor(**data.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@app.get("/api/vendors/{vendor_id}", response_model=VendorResponse)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


# ═══════════════════════════════════════════════════════════════
# PRODUCT ENDPOINTS
# ═══════════════════════════════════════════════════════════════
@app.get("/api/products", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).all()


@app.post("/api/products", response_model=ProductResponse, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    existing = db.query(Product).filter(Product.sku == data.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU '{data.sku}' already exists")
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@app.get("/api/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# ═══════════════════════════════════════════════════════════════
# PURCHASE ORDER ENDPOINTS
# ═══════════════════════════════════════════════════════════════
@app.get("/api/orders", response_model=list[PurchaseOrderResponse])
def list_orders(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(PurchaseOrder).options(
        joinedload(PurchaseOrder.vendor),
        joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
    )

    if status:
        query = query.filter(PurchaseOrder.status == status)
    if search:
        query = query.filter(
            PurchaseOrder.reference_no.ilike(f"%{search}%")
        )

    orders = query.order_by(PurchaseOrder.created_at.desc()).all()
    result = []
    for order in orders:
        subtotal, tax, _ = calculate_total(order.items)
        items_resp = [
            POItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else None,
                product_sku=item.product.sku if item.product else None,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in order.items
        ]
        result.append(
            PurchaseOrderResponse(
                id=order.id,
                reference_no=order.reference_no,
                vendor_id=order.vendor_id,
                vendor_name=order.vendor.name if order.vendor else None,
                total_amount=order.total_amount,
                subtotal=subtotal,
                tax_amount=tax,
                status=order.status,
                created_at=order.created_at,
                items=items_resp,
            )
        )
    return result


@app.get("/api/orders/{order_id}", response_model=PurchaseOrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
        )
        .filter(PurchaseOrder.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    subtotal, tax, _ = calculate_total(order.items)
    items_resp = [
        POItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name if item.product else None,
            product_sku=item.product.sku if item.product else None,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for item in order.items
    ]
    return PurchaseOrderResponse(
        id=order.id,
        reference_no=order.reference_no,
        vendor_id=order.vendor_id,
        vendor_name=order.vendor.name if order.vendor else None,
        total_amount=order.total_amount,
        subtotal=subtotal,
        tax_amount=tax,
        status=order.status,
        created_at=order.created_at,
        items=items_resp,
    )


@app.post("/api/orders", response_model=PurchaseOrderResponse, status_code=201)
def create_order(data: PurchaseOrderCreate, db: Session = Depends(get_db)):
    # Validate vendor
    vendor = db.query(Vendor).filter(Vendor.id == data.vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    if not data.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    # Generate reference number
    ref_no = f"PO-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    # Create PO
    po = PurchaseOrder(reference_no=ref_no, vendor_id=data.vendor_id)
    db.add(po)
    db.flush()

    # Create line items
    order_items = []
    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            db.rollback()
            raise HTTPException(
                status_code=404,
                detail=f"Product ID {item_data.product_id} not found",
            )
        line_total = round(product.unit_price * item_data.quantity, 2)
        oi = PurchaseOrderItem(
            po_id=po.id,
            product_id=product.id,
            quantity=item_data.quantity,
            unit_price=product.unit_price,
            line_total=line_total,
        )
        db.add(oi)
        order_items.append(oi)

    db.flush()

    # Calculate total with tax
    subtotal, tax, total = calculate_total(order_items)
    po.total_amount = total
    db.commit()
    db.refresh(po)

    items_resp = [
        POItemResponse(
            id=oi.id,
            product_id=oi.product_id,
            product_name=db.query(Product).filter(Product.id == oi.product_id).first().name,
            product_sku=db.query(Product).filter(Product.id == oi.product_id).first().sku,
            quantity=oi.quantity,
            unit_price=oi.unit_price,
            line_total=oi.line_total,
        )
        for oi in order_items
    ]

    return PurchaseOrderResponse(
        id=po.id,
        reference_no=po.reference_no,
        vendor_id=po.vendor_id,
        vendor_name=vendor.name,
        total_amount=po.total_amount,
        subtotal=subtotal,
        tax_amount=tax,
        status=po.status,
        created_at=po.created_at,
        items=items_resp,
    )


# ═══════════════════════════════════════════════════════════════
# STATUS UPDATE + INVENTORY CONTROL
# ═══════════════════════════════════════════════════════════════
@app.patch("/api/orders/{order_id}/status", response_model=PurchaseOrderResponse)
def update_order_status(order_id: int, data: StatusUpdate, db: Session = Depends(get_db)):
    order = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
        )
        .filter(PurchaseOrder.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = order.status
    order.status = data.status

    # ── Inventory Control: Update stock when marked "Received" ──
    if data.status == "Received" and old_status != "Received":
        for item in order.items:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                product.stock_level += item.quantity

    db.commit()
    db.refresh(order)

    subtotal, tax, _ = calculate_total(order.items)
    items_resp = [
        POItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product.name if item.product else None,
            product_sku=item.product.sku if item.product else None,
            quantity=item.quantity,
            unit_price=item.unit_price,
            line_total=item.line_total,
        )
        for item in order.items
    ]

    return PurchaseOrderResponse(
        id=order.id,
        reference_no=order.reference_no,
        vendor_id=order.vendor_id,
        vendor_name=order.vendor.name if order.vendor else None,
        total_amount=order.total_amount,
        subtotal=subtotal,
        tax_amount=tax,
        status=order.status,
        created_at=order.created_at,
        items=items_resp,
    )


# ═══════════════════════════════════════════════════════════════
# PDF INVOICE GENERATION
# ═══════════════════════════════════════════════════════════════
@app.get("/api/orders/{order_id}/invoice")
def generate_invoice(order_id: int, db: Session = Depends(get_db)):
    order = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.vendor),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
        )
        .filter(PurchaseOrder.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "InvoiceTitle", parent=styles["Heading1"],
        fontSize=22, textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "SubTitle", parent=styles["Normal"],
        fontSize=11, textColor=colors.HexColor("#555555"),
        spaceAfter=4,
    )

    elements = []

    # Header
    elements.append(Paragraph("PURCHASE ORDER INVOICE", title_style))
    elements.append(Spacer(1, 4*mm))
    elements.append(Paragraph(f"<b>Reference:</b> {order.reference_no}", subtitle_style))
    elements.append(Paragraph(f"<b>Date:</b> {order.created_at.strftime('%d %b %Y')}", subtitle_style))
    elements.append(Paragraph(f"<b>Status:</b> {order.status}", subtitle_style))
    elements.append(Spacer(1, 6*mm))

    # Vendor info
    elements.append(Paragraph("<b>Vendor Details</b>", styles["Heading3"]))
    elements.append(Paragraph(f"Name: {order.vendor.name}", subtitle_style))
    elements.append(Paragraph(f"Contact: {order.vendor.contact}", subtitle_style))
    elements.append(Spacer(1, 6*mm))

    # Items table
    table_data = [["#", "Product", "SKU", "Qty", "Unit Price", "Line Total"]]
    for idx, item in enumerate(order.items, 1):
        table_data.append([
            str(idx),
            item.product.name if item.product else "N/A",
            item.product.sku if item.product else "N/A",
            str(item.quantity),
            f"${item.unit_price:,.2f}",
            f"${item.line_total:,.2f}",
        ])

    subtotal, tax, total = calculate_total(order.items)
    table_data.append(["", "", "", "", "Subtotal:", f"${subtotal:,.2f}"])
    table_data.append(["", "", "", "", "Tax (5%):", f"${tax:,.2f}"])
    table_data.append(["", "", "", "", "TOTAL:", f"${total:,.2f}"])

    col_widths = [25, 150, 80, 40, 75, 80]
    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("ALIGN", (1, 1), (1, -1), "LEFT"),
        ("ALIGN", (2, 1), (2, -1), "LEFT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e8e8e8")),
        ("GRID", (0, 0), (-1, -4), 0.5, colors.grey),
        ("LINEBELOW", (4, -3), (-1, -3), 0.5, colors.grey),
        ("LINEBELOW", (4, -2), (-1, -2), 0.5, colors.grey),
        ("LINEBELOW", (4, -1), (-1, -1), 1, colors.black),
        ("ROWBACKGROUNDS", (0, 1), (-1, -4), [colors.white, colors.HexColor("#f9f9f9")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="Invoice_{order.reference_no}.pdf"'
        },
    )


# ── Run with: uvicorn main:app --reload --port 8000 ────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
