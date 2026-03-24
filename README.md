# Purchase Order (PO) Management System

A full-stack Purchase Order Management System built as an ERP micro-service with inventory control, PDF invoice generation, and a modern responsive dashboard.

> **Assignment:** IV Innovations Private Limited – ERP System PO Module

---

## 🏗️ Architecture

```
po_management_system/
├── backend/
│   ├── main.py           # FastAPI application (all API routes)
│   ├── models.py         # SQLAlchemy ORM models
│   ├── database.py       # Database engine & session
│   ├── schemas.py        # Pydantic validation schemas
│   ├── init_db.sql       # PostgreSQL DDL + seed data
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── index.html        # Dashboard UI
│   ├── style.css         # Premium dark theme CSS
│   └── app.js            # All frontend logic
└── README.md
```

---

## 🗄️ Database Design

### Schema Overview

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| **vendors** | Supplier master data | name, contact, rating |
| **products** | Product catalog with stock | name, sku, unit_price, stock_level |
| **purchase_orders** | Order header | reference_no, vendor_id (FK), total_amount, status |
| **purchase_order_items** | Line items per order | po_id (FK), product_id (FK), quantity, unit_price, line_total |

### Design Rationale

- **Normalized design** (3NF): Vendors, Products, and Orders are separate entities linked via foreign keys to avoid data duplication.
- **Line-items pattern**: `purchase_order_items` allows many products per order with individual quantities and pricing.
- **Status workflow**: Orders flow through `Draft → Confirmed → Received` (or `Cancelled`). Stock updates happen only on `Received`.
- **Referential integrity**: Foreign keys with `ON DELETE CASCADE` on line items ensure data consistency.

---

## 🚀 How to Run

### Prerequisites
- Python 3.9+
- pip

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
cd backend
python main.py
```

The API runs on **http://localhost:8000**. Swagger docs at **http://localhost:8000/docs**.

> The app uses SQLite by default. To switch to PostgreSQL, set the environment variable:
> ```
> set DATABASE_URL=postgresql://user:pass@localhost:5432/po_management
> ```

### 3. Open the Frontend

Open `frontend/index.html` in your browser. The frontend connects to `http://localhost:8000/api`.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vendors` | List all vendors |
| POST | `/api/vendors` | Create a new vendor |
| GET | `/api/products` | List all products |
| POST | `/api/products` | Create a new product |
| GET | `/api/orders` | List orders (supports `?status=` and `?search=` filters) |
| POST | `/api/orders` | Create a PO with line items (auto-calculates total + 5% tax) |
| GET | `/api/orders/{id}` | Get order details with items |
| PATCH | `/api/orders/{id}/status` | Update status (triggers stock update on "Received") |
| GET | `/api/orders/{id}/invoice` | Download PDF invoice |

---

## ✨ Features

- **Auto-calculate total**: Subtotal + 5% tax applied automatically
- **PDF Invoice**: Downloadable, professionally formatted invoices via ReportLab
- **Inventory Control**: Stock levels automatically increment when a PO is marked as "Received"
- **Dynamic Line Items**: Add/remove product rows in the order form
- **Search & Filter**: Search orders by reference number, filter by status
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Dark Theme**: Modern glassmorphism UI with smooth animations
- **Seed Data**: Pre-loaded sample vendors and products for immediate testing

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python, FastAPI, SQLAlchemy |
| Database | SQLite (configurable to PostgreSQL) |
| Frontend | HTML5, CSS3 (Flexbox/Grid), Vanilla JavaScript |
| PDF | ReportLab |

---

## 📝 Business Logic

### Calculate Total
```
line_total = unit_price × quantity
subtotal   = Σ line_totals
tax        = subtotal × 0.05
total      = subtotal + tax
```

### Inventory Update (ERP Logic)
When an order status changes to **"Received"**, each product's `stock_level` is incremented by the ordered `quantity`. This only happens once (the first time the status reaches "Received").

---

*Built for IV Innovations Pvt Ltd – ERP Assignment*
