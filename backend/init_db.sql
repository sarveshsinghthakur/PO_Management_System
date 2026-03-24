-- ============================================================
-- PO Management System – PostgreSQL Schema
-- ============================================================

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    contact    VARCHAR(200) NOT NULL,
    rating     FLOAT DEFAULT 0.0
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    sku         VARCHAR(50)  NOT NULL UNIQUE,
    unit_price  FLOAT        NOT NULL,
    stock_level INTEGER      DEFAULT 0
);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id           SERIAL PRIMARY KEY,
    reference_no VARCHAR(50)  NOT NULL UNIQUE,
    vendor_id    INTEGER      NOT NULL REFERENCES vendors(id),
    total_amount FLOAT        DEFAULT 0.0,
    status       VARCHAR(20)  DEFAULT 'Draft',
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Order Items (line items)
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id          SERIAL PRIMARY KEY,
    po_id       INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL,
    unit_price  FLOAT   NOT NULL,
    line_total  FLOAT   NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_po_vendor    ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_poi_po       ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_poi_product  ON purchase_order_items(product_id);

-- ── Seed data ──────────────────────────────────────────────────
INSERT INTO vendors (name, contact, rating) VALUES
    ('Acme Supplies',     'acme@example.com',        4.5),
    ('Global Parts Inc.', 'globalparts@example.com',  4.2),
    ('TechSource Ltd.',   'techsource@example.com',   4.8),
    ('Industrial Mart',   'indmart@example.com',       3.9)
ON CONFLICT DO NOTHING;

INSERT INTO products (name, sku, unit_price, stock_level) VALUES
    ('Steel Bolts (100pc)',  'STL-BLT-100', 12.50,  500),
    ('Copper Wire (50m)',    'COP-WIR-50',  45.00,  200),
    ('Circuit Board v2',     'CIR-BRD-V2',  89.99,  150),
    ('LED Panel 24W',        'LED-PNL-24',  34.75,  320),
    ('Hydraulic Pump HP-3',  'HYD-PMP-03',  250.00,  40),
    ('Rubber Gasket Set',    'RUB-GSK-ST',   8.25, 1000)
ON CONFLICT DO NOTHING;
