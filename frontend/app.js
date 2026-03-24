/**
 * PO Management System – Frontend Application
 * =============================================
 * Handles all API calls, UI interactions, dynamic row management,
 * search/filter, and PDF invoice downloads.
 */

const API = window.location.origin + "/api";

// ── State ──────────────────────────────────────────────────────
let vendors = [];
let products = [];
let orders = [];

// ── DOM Elements ───────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initClock();
    initForms();
    initModals();
    initFilters();
    loadAll();
    addLineItemRow(); // start with one empty row
});

// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════
function initNavigation() {
    $$(".nav-item").forEach((item) => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
        });
    });

    // Mobile menu toggle
    $("#menu-toggle").addEventListener("click", () => {
        $("#sidebar").classList.toggle("open");
    });
}

function switchSection(name) {
    $$(".nav-item").forEach((n) => n.classList.remove("active"));
    $(`[data-section="${name}"]`).classList.add("active");

    $$(".content-section").forEach((s) => s.classList.remove("active"));
    $(`#section-${name}`).classList.add("active");

    const titles = {
        dashboard: "Dashboard",
        "create-order": "Create Order",
        orders: "All Orders",
        vendors: "Vendors",
        products: "Products",
    };
    $("#page-title").textContent = titles[name] || "Dashboard";

    // Close sidebar on mobile
    $("#sidebar").classList.remove("open");

    // Refresh data when switching
    if (name === "dashboard") loadDashboard();
    if (name === "orders") loadOrders();
    if (name === "vendors") loadVendors();
    if (name === "products") loadProducts();
}

// ════════════════════════════════════════════════════════════════
// LIVE CLOCK
// ════════════════════════════════════════════════════════════════
function initClock() {
    const update = () => {
        const now = new Date();
        $("#live-clock").textContent = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };
    update();
    setInterval(update, 1000);
}

// ════════════════════════════════════════════════════════════════
// LOAD ALL DATA
// ════════════════════════════════════════════════════════════════
async function loadAll() {
    await Promise.all([loadVendors(), loadProducts(), loadOrders()]);
    loadDashboard();
}

// ── Vendors ────────────────────────────────────────────────────
async function loadVendors() {
    try {
        const res = await fetch(`${API}/vendors`);
        vendors = await res.json();
        renderVendorsTable();
        populateVendorDropdown();
    } catch (err) {
        showToast("Failed to load vendors", "error");
    }
}

function renderVendorsTable() {
    const tbody = $("#vendors-table tbody");
    tbody.innerHTML = vendors
        .map(
            (v) => `
        <tr>
            <td>${v.id}</td>
            <td>${v.name}</td>
            <td>${v.contact}</td>
            <td><span class="rating">${"★".repeat(Math.round(v.rating))}${"☆".repeat(5 - Math.round(v.rating))}</span> ${v.rating}</td>
        </tr>`
        )
        .join("");
}

function populateVendorDropdown() {
    const select = $("#vendor-select");
    const current = select.value;
    select.innerHTML = '<option value="">— Choose a vendor —</option>';
    vendors.forEach((v) => {
        select.innerHTML += `<option value="${v.id}">${v.name} (Rating: ${v.rating})</option>`;
    });
    select.value = current;
}

// ── Products ───────────────────────────────────────────────────
async function loadProducts() {
    try {
        const res = await fetch(`${API}/products`);
        products = await res.json();
        renderProductsTable();
        updateProductDropdowns();
    } catch (err) {
        showToast("Failed to load products", "error");
    }
}

function renderProductsTable() {
    const tbody = $("#products-table tbody");
    tbody.innerHTML = products
        .map(
            (p) => `
        <tr>
            <td>${p.id}</td>
            <td>${p.name}</td>
            <td><code>${p.sku}</code></td>
            <td>$${p.unit_price.toFixed(2)}</td>
            <td><span class="${p.stock_level < 50 ? "text-danger" : ""}">${p.stock_level}</span></td>
        </tr>`
        )
        .join("");
}

function updateProductDropdowns() {
    $$(".product-select").forEach((sel) => {
        const current = sel.value;
        sel.innerHTML = '<option value="">— Select product —</option>';
        products.forEach((p) => {
            sel.innerHTML += `<option value="${p.id}" data-price="${p.unit_price}">${p.name} ($${p.unit_price.toFixed(2)})</option>`;
        });
        sel.value = current;
    });
}

// ── Orders ─────────────────────────────────────────────────────
async function loadOrders(statusFilter = "", searchTerm = "") {
    try {
        let url = `${API}/orders?`;
        if (statusFilter) url += `status=${statusFilter}&`;
        if (searchTerm) url += `search=${encodeURIComponent(searchTerm)}&`;
        const res = await fetch(url);
        orders = await res.json();
        renderOrdersTable();
    } catch (err) {
        showToast("Failed to load orders", "error");
    }
}

function renderOrdersTable() {
    const tbody = $("#orders-table tbody");
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:32px;">No orders found</td></tr>`;
        return;
    }
    tbody.innerHTML = orders
        .map(
            (o) => `
        <tr>
            <td><strong>${o.reference_no}</strong></td>
            <td>${o.vendor_name || "N/A"}</td>
            <td>${o.items ? o.items.length : 0}</td>
            <td>$${o.total_amount.toFixed(2)}</td>
            <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="btn btn-sm btn-info" onclick="viewOrder(${o.id})">View</button>
                    <button class="btn btn-sm btn-warning" onclick="downloadInvoice(${o.id})">PDF</button>
                    ${o.status === "Draft" ? `<button class="btn btn-sm btn-success" onclick="updateStatus(${o.id},'Confirmed')">Confirm</button>` : ""}
                    ${o.status === "Confirmed" ? `<button class="btn btn-sm btn-success" onclick="updateStatus(${o.id},'Received')">Receive</button>` : ""}
                    ${o.status !== "Cancelled" && o.status !== "Received" ? `<button class="btn btn-sm btn-danger" onclick="updateStatus(${o.id},'Cancelled')">Cancel</button>` : ""}
                </div>
            </td>
        </tr>`
        )
        .join("");
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
function loadDashboard() {
    const total = orders.length;
    const received = orders.filter((o) => o.status === "Received").length;
    const draft = orders.filter((o) => o.status === "Draft" || o.status === "Confirmed").length;
    const value = orders.reduce((sum, o) => sum + o.total_amount, 0);

    animateCounter("stat-total-orders", total);
    animateCounter("stat-received", received);
    animateCounter("stat-draft", draft);
    $("#stat-total-value").textContent = `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    // Recent orders (latest 5)
    const recent = orders.slice(0, 5);
    const recentTbody = $("#recent-orders-table tbody");
    recentTbody.innerHTML = recent
        .map(
            (o) => `
        <tr>
            <td>${o.reference_no}</td>
            <td>${o.vendor_name || "N/A"}</td>
            <td>$${o.total_amount.toFixed(2)}</td>
            <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
        </tr>`
        )
        .join("") || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No orders yet</td></tr>`;

    // Inventory overview
    const invTbody = $("#inventory-table tbody");
    invTbody.innerHTML = products
        .map(
            (p) => `
        <tr>
            <td>${p.name}</td>
            <td><code>${p.sku}</code></td>
            <td style="color: ${p.stock_level < 50 ? "var(--danger)" : "var(--success)"}">${p.stock_level}</td>
        </tr>`
        )
        .join("");
}

function animateCounter(id, target) {
    const el = document.getElementById(id);
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const timer = setInterval(() => {
        current += step;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        el.textContent = current;
    }, 25);
}

// ════════════════════════════════════════════════════════════════
// LINE ITEMS (Add Row / Remove Row)
// ════════════════════════════════════════════════════════════════
let rowCounter = 0;

function addLineItemRow() {
    rowCounter++;
    const container = $("#line-items-container");
    const row = document.createElement("div");
    row.className = "line-item-row";
    row.id = `line-row-${rowCounter}`;

    row.innerHTML = `
        <div>
            <label>Product</label>
            <select class="product-select" onchange="onProductChange(this)" required>
                <option value="">— Select product —</option>
                ${products.map((p) => `<option value="${p.id}" data-price="${p.unit_price}">${p.name} ($${p.unit_price.toFixed(2)})</option>`).join("")}
            </select>
        </div>
        <div>
            <label>Unit Price</label>
            <input type="text" class="row-price" value="$0.00" readonly />
        </div>
        <div>
            <label>Quantity</label>
            <input type="number" class="row-qty" min="1" value="1" onchange="recalcSummary()" oninput="recalcSummary()" required />
        </div>
        <div>
            <label>Line Total</label>
            <input type="text" class="row-total" value="$0.00" readonly />
        </div>
        <button type="button" class="btn-remove-row" onclick="removeRow('line-row-${rowCounter}')">✕</button>
    `;

    container.appendChild(row);
}

function removeRow(id) {
    const row = document.getElementById(id);
    if (row) {
        row.style.animation = "slideIn 0.2s ease reverse";
        setTimeout(() => {
            row.remove();
            recalcSummary();
        }, 200);
    }
}

function onProductChange(select) {
    const row = select.closest(".line-item-row");
    const opt = select.options[select.selectedIndex];
    const price = parseFloat(opt.dataset.price) || 0;
    row.querySelector(".row-price").value = `$${price.toFixed(2)}`;
    recalcSummary();
}

function recalcSummary() {
    const rows = $$(".line-item-row");
    let subtotal = 0;

    rows.forEach((row) => {
        const sel = row.querySelector(".product-select");
        const opt = sel.options[sel.selectedIndex];
        const price = parseFloat(opt?.dataset?.price) || 0;
        const qty = parseInt(row.querySelector(".row-qty").value) || 0;
        const lineTotal = price * qty;
        row.querySelector(".row-total").value = `$${lineTotal.toFixed(2)}`;
        subtotal += lineTotal;
    });

    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    const summary = $("#order-summary");
    summary.style.display = subtotal > 0 ? "block" : "none";
    $("#summary-subtotal").textContent = `$${subtotal.toFixed(2)}`;
    $("#summary-tax").textContent = `$${tax.toFixed(2)}`;
    $("#summary-total").textContent = `$${total.toFixed(2)}`;
}

// ════════════════════════════════════════════════════════════════
// FORMS
// ════════════════════════════════════════════════════════════════
function initForms() {
    // Add row button
    $("#add-row-btn").addEventListener("click", addLineItemRow);

    // Reset form
    $("#reset-form-btn").addEventListener("click", () => {
        $("#line-items-container").innerHTML = "";
        rowCounter = 0;
        addLineItemRow();
        $("#order-summary").style.display = "none";
    });

    // Submit PO
    $("#po-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const vendorId = parseInt($("#vendor-select").value);
        if (!vendorId) {
            showToast("Please select a vendor", "error");
            return;
        }

        const items = [];
        const rows = $$(".line-item-row");
        for (const row of rows) {
            const productId = parseInt(row.querySelector(".product-select").value);
            const qty = parseInt(row.querySelector(".row-qty").value);
            if (!productId) {
                showToast("Please select a product in every row", "error");
                return;
            }
            if (!qty || qty < 1) {
                showToast("Quantity must be at least 1", "error");
                return;
            }
            items.push({ product_id: productId, quantity: qty });
        }

        try {
            const btn = $("#submit-order-btn");
            btn.disabled = true;
            btn.textContent = "Creating...";

            const res = await fetch(`${API}/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vendor_id: vendorId, items }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create order");
            }

            const order = await res.json();
            showToast(`Order ${order.reference_no} created successfully!`, "success");

            // Reset form
            $("#po-form").reset();
            $("#line-items-container").innerHTML = "";
            rowCounter = 0;
            addLineItemRow();
            $("#order-summary").style.display = "none";

            // Reload data
            await loadOrders();
            loadDashboard();

            // Switch to orders view
            switchSection("orders");
        } catch (err) {
            showToast(err.message, "error");
        } finally {
            const btn = $("#submit-order-btn");
            btn.disabled = false;
            btn.textContent = "Create Purchase Order";
        }
    });

    // Vendor form
    $("#vendor-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API}/vendors`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: $("#vendor-name").value,
                    contact: $("#vendor-contact").value,
                    rating: parseFloat($("#vendor-rating").value) || 0,
                }),
            });
            if (!res.ok) throw new Error("Failed to create vendor");
            showToast("Vendor created!", "success");
            $("#vendor-modal").classList.remove("active");
            $("#vendor-form").reset();
            await loadVendors();
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    // Product form
    $("#product-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API}/products`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: $("#product-name").value,
                    sku: $("#product-sku").value,
                    unit_price: parseFloat($("#product-price").value),
                    stock_level: parseInt($("#product-stock").value) || 0,
                }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create product");
            }
            showToast("Product created!", "success");
            $("#product-modal").classList.remove("active");
            $("#product-form").reset();
            await loadProducts();
        } catch (err) {
            showToast(err.message, "error");
        }
    });
}

// ════════════════════════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════════════════════════
function initModals() {
    $("#add-vendor-btn").addEventListener("click", () => {
        $("#vendor-modal").classList.add("active");
    });
    $("#close-vendor-modal").addEventListener("click", () => {
        $("#vendor-modal").classList.remove("active");
    });

    $("#add-product-btn").addEventListener("click", () => {
        $("#product-modal").classList.add("active");
    });
    $("#close-product-modal").addEventListener("click", () => {
        $("#product-modal").classList.remove("active");
    });

    $("#close-order-modal").addEventListener("click", () => {
        $("#order-detail-modal").classList.remove("active");
    });

    // Close modals on overlay click
    $$(".modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) overlay.classList.remove("active");
        });
    });
}

// ════════════════════════════════════════════════════════════════
// FILTERS
// ════════════════════════════════════════════════════════════════
function initFilters() {
    let debounceTimer;

    $("#search-orders").addEventListener("input", (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadOrders($("#filter-status").value, e.target.value);
        }, 350);
    });

    $("#filter-status").addEventListener("change", (e) => {
        loadOrders(e.target.value, $("#search-orders").value);
    });
}

// ════════════════════════════════════════════════════════════════
// ORDER ACTIONS
// ════════════════════════════════════════════════════════════════
async function viewOrder(id) {
    try {
        const res = await fetch(`${API}/orders/${id}`);
        if (!res.ok) throw new Error("Order not found");
        const order = await res.json();

        $("#order-detail-title").textContent = `Order: ${order.reference_no}`;

        const itemsHTML = order.items
            .map(
                (item, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${item.product_name || "N/A"}</td>
                <td>${item.product_sku || "N/A"}</td>
                <td>${item.quantity}</td>
                <td>$${item.unit_price.toFixed(2)}</td>
                <td>$${item.line_total.toFixed(2)}</td>
            </tr>`
            )
            .join("");

        $("#order-detail-content").innerHTML = `
            <div class="order-detail-grid">
                <div class="detail-item">
                    <label>Reference</label>
                    <p>${order.reference_no}</p>
                </div>
                <div class="detail-item">
                    <label>Vendor</label>
                    <p>${order.vendor_name || "N/A"}</p>
                </div>
                <div class="detail-item">
                    <label>Status</label>
                    <p><span class="badge badge-${order.status.toLowerCase()}">${order.status}</span></p>
                </div>
                <div class="detail-item">
                    <label>Date</label>
                    <p>${new Date(order.created_at).toLocaleDateString()}</p>
                </div>
            </div>

            <h4 style="margin-bottom:10px;">Line Items</h4>
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr><th>#</th><th>Product</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th></tr>
                    </thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
            </div>

            <div class="order-summary" style="display:block; margin-top:16px;">
                <div class="summary-row"><span>Subtotal:</span><span>$${(order.subtotal || 0).toFixed(2)}</span></div>
                <div class="summary-row"><span>Tax (5%):</span><span>$${(order.tax_amount || 0).toFixed(2)}</span></div>
                <div class="summary-row total"><span>Total:</span><span>$${order.total_amount.toFixed(2)}</span></div>
            </div>

            <div class="detail-actions">
                <button class="btn btn-sm btn-warning" onclick="downloadInvoice(${order.id})">📄 Download PDF Invoice</button>
                ${order.status === "Draft" ? `<button class="btn btn-sm btn-success" onclick="updateStatus(${order.id},'Confirmed')">✅ Confirm</button>` : ""}
                ${order.status === "Confirmed" ? `<button class="btn btn-sm btn-success" onclick="updateStatus(${order.id},'Received')">📥 Mark Received</button>` : ""}
                ${order.status !== "Cancelled" && order.status !== "Received" ? `<button class="btn btn-sm btn-danger" onclick="updateStatus(${order.id},'Cancelled')">❌ Cancel</button>` : ""}
            </div>
        `;

        $("#order-detail-modal").classList.add("active");
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function updateStatus(id, status) {
    try {
        const res = await fetch(`${API}/orders/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error("Failed to update status");

        const msg = status === "Received"
            ? `Order marked as Received — Stock levels updated!`
            : `Order status changed to ${status}`;
        showToast(msg, "success");

        // Close modal if open
        $("#order-detail-modal").classList.remove("active");

        // Reload everything
        await Promise.all([loadOrders(), loadProducts()]);
        loadDashboard();
    } catch (err) {
        showToast(err.message, "error");
    }
}

function downloadInvoice(id) {
    window.open(`${API}/orders/${id}/invoice`, "_blank");
}

// ════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════════
function showToast(message, type = "info") {
    const container = $("#toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
