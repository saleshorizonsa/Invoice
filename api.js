/* ==========================================================================
   HORIZONGET API CLIENT — JWT-backed fetch helper + data normalizers
   ========================================================================== */

let _pricingCache = {};

async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('horizon_token');
    const config = {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json' }
    };
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    if (options.body !== undefined) config.body = JSON.stringify(options.body);

    const resp = await fetch(endpoint, config);

    if (resp.status === 401) {
        clearSession();
        window.location.reload();
        return null;
    }

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function getActiveUser() {
    try { return JSON.parse(localStorage.getItem('horizon_user')); } catch { return null; }
}

function cacheUser(user) {
    localStorage.setItem('horizon_user', JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem('horizon_token');
    localStorage.removeItem('horizon_user');
}

async function fetchAndCacheUser() {
    try {
        const [profile, settings] = await Promise.all([
            apiCall('/api/auth/me'),
            apiCall('/api/settings')
        ]);
        if (!profile) return null;
        const s = settings || {};
        const merged = {
            ...profile,
            payment: {
                type:        s.payment_type  || 'bank',
                bankName:    s.bank_name     || '',
                bankAccount: s.bank_account  || '',
                bankRouting: s.bank_routing  || '',
                upiId:       s.upi_id        || '',
                upiName:     s.upi_name      || '',
                paypalId:    s.paypal_id     || '',
                customUrl:   s.custom_url    || '',
                notes:       s.notes         || ''
            }
        };
        cacheUser(merged);
        return merged;
    } catch { return null; }
}

async function loadPricingCache() {
    try {
        _pricingCache = await apiCall('/api/public/pricing') || {};
    } catch {
        _pricingCache = {};
    }
}

function getPricingCache() { return _pricingCache; }

function normalizeInvoice(row) {
    const payData = (typeof row.payment_data === 'string')
        ? JSON.parse(row.payment_data || '{}')
        : (row.payment_data || {});
    const user = getActiveUser();
    return {
        id:            row.id,
        invoiceNumber: row.invoice_number,
        issueDate:     row.issue_date,
        dueDate:       row.due_date,
        country:       row.country,
        clientName:    row.client_name,
        clientEmail:   row.client_email   || '',
        clientPhone:   row.client_phone   || '',
        clientAddress: row.client_address || '',
        clientTaxReg:  row.client_tax_id  || '',
        items:         typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []),
        subtotal:      parseFloat(row.subtotal)    || 0,
        discount:      parseFloat(row.discount)    || 0,
        taxRate:       parseFloat(row.tax_rate)    || 0,
        taxAmount:     parseFloat(row.tax_amount)  || 0,
        grandTotal:    parseFloat(row.grand_total) || 0,
        paymentType:   row.payment_type,
        bankName:      payData.bankName     || '',
        bankAccount:   payData.bankAccount  || '',
        bankRouting:   payData.bankRouting  || '',
        upiId:         payData.upiId        || '',
        upiName:       payData.upiName      || '',
        paypalId:      payData.paypalId     || '',
        customUrl:     payData.customUrl    || '',
        notes:         row.notes            || '',
        senderName:    user ? (user.companyName || '') : '',
        status:        row.status === 'paid' ? 'Paid' : 'Outstanding',
        timestamp:     new Date(row.created_at).getTime()
    };
}

function normalizeClient(row) {
    return {
        id:      row.id,
        name:    row.name,
        email:   row.email   || '',
        phone:   row.phone   || '',
        address: row.address || '',
        taxReg:  row.tax_reg || ''
    };
}
