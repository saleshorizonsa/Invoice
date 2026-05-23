require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2/promise');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'horizon-change-this-secret';

app.use(express.json({ limit: '10mb' }));

/* ── Database Pool ─────────────────────────────────────────────────────────── */
const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'horizon_invoice',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
});

/* ── Create Tables ─────────────────────────────────────────────────────────── */
async function initDB() {
    const c = await pool.getConnection();
    try {
        await c.query(`
            CREATE TABLE IF NOT EXISTS users (
                id           INT AUTO_INCREMENT PRIMARY KEY,
                name         VARCHAR(255) NOT NULL,
                company_name VARCHAR(255),
                email        VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                country      VARCHAR(10)  DEFAULT 'US',
                phone        VARCHAR(50),
                address      TEXT,
                tax_id       VARCHAR(100),
                logo         LONGTEXT,
                plan         VARCHAR(20)  DEFAULT 'free',
                is_admin     BOOLEAN      DEFAULT FALSE,
                created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await c.query(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id      INT PRIMARY KEY,
                payment_type VARCHAR(20)  DEFAULT 'bank',
                bank_name    VARCHAR(255),
                bank_account VARCHAR(255),
                bank_routing VARCHAR(255),
                upi_id       VARCHAR(255),
                upi_name     VARCHAR(255),
                paypal_id    VARCHAR(255),
                custom_url   VARCHAR(500),
                notes        TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await c.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id            VARCHAR(60)     PRIMARY KEY,
                user_id       INT             NOT NULL,
                invoice_number VARCHAR(80),
                issue_date    VARCHAR(50),
                due_date      VARCHAR(50),
                country       VARCHAR(10),
                client_name   VARCHAR(255),
                client_email  VARCHAR(255),
                client_phone  VARCHAR(100),
                client_address TEXT,
                client_tax_id  VARCHAR(100),
                items          JSON,
                subtotal       DECIMAL(15,2)  DEFAULT 0,
                discount       DECIMAL(15,2)  DEFAULT 0,
                tax_rate       DECIMAL(6,2)   DEFAULT 0,
                tax_amount     DECIMAL(15,2)  DEFAULT 0,
                grand_total    DECIMAL(15,2)  DEFAULT 0,
                payment_type  VARCHAR(20),
                payment_data  JSON,
                notes         TEXT,
                status        VARCHAR(20)     DEFAULT 'outstanding',
                created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
                updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await c.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id         VARCHAR(60)  PRIMARY KEY,
                user_id    INT          NOT NULL,
                name       VARCHAR(255) NOT NULL,
                email      VARCHAR(255),
                phone      VARCHAR(100),
                address    TEXT,
                tax_reg    VARCHAR(100),
                created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await c.query(`
            CREATE TABLE IF NOT EXISTS admin_pricing (
                country_code VARCHAR(10) PRIMARY KEY,
                tax_rate     DECIMAL(6,2) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        /* ── Seed admin ── */
        const [[admin]] = await c.query('SELECT id FROM users WHERE email = ?', ['sales@horizon-sa.net']);
        if (!admin) {
            const hash = await bcrypt.hash('Basis@6695', 10);
            await c.query(`INSERT INTO users (name,company_name,email,password_hash,country,plan,is_admin)
                           VALUES (?,?,?,?,?,?,?)`,
                ['Horizon Admin','Horizon','sales@horizon-sa.net', hash,'SA','business',true]);
        }

        /* ── Seed guest demo ── */
        const [[guest]] = await c.query('SELECT id FROM users WHERE email = ?', ['guest@horizon.com']);
        if (!guest) {
            const hash = await bcrypt.hash('guest', 10);
            await c.query(`INSERT INTO users (name,company_name,email,password_hash,country,phone,address,tax_id,plan)
                           VALUES (?,?,?,?,?,?,?,?,?)`,
                ['Guest Merchant','Horizon Ventures','guest@horizon.com',hash,'US',
                 '+1 (555) 019-9000','456 Skyline Boulevard\nSan Francisco, CA 94107','EIN-88-2947192','free']);
        }

        console.log('✅  Database ready');
    } finally {
        c.release();
    }
}

/* ── Auth Middleware ────────────────────────────────────────────────────────── */
function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Session expired — please sign in again' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
        next();
    });
}

/* ── Helper ─────────────────────────────────────────────────────────────────── */
function userRow(u) {
    return {
        id: u.id, name: u.name, companyName: u.company_name,
        email: u.email, country: u.country, phone: u.phone,
        address: u.address, taxId: u.tax_id, logo: u.logo,
        plan: u.plan, isAdmin: !!u.is_admin
    };
}

/* ══════════════════════════════════════════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════════════════════════════════════════ */

/* Register */
app.post('/api/auth/register', async (req, res) => {
    const { name, companyName, email, password, country, plan } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    if (password.length < 6)          return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
        const [[ex]] = await pool.query('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
        if (ex) return res.status(409).json({ error: 'Email already registered' });

        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (name,company_name,email,password_hash,country,plan) VALUES (?,?,?,?,?,?)',
            [name, companyName||'', email.toLowerCase(), hash, country||'US', plan||'free']
        );
        const token = jwt.sign({ id: result.insertId, email: email.toLowerCase(), isAdmin: false }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: result.insertId, name, companyName, email: email.toLowerCase(), country: country||'US', plan: plan||'free', isAdmin: false } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/* Login */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const [[u]] = await pool.query('SELECT * FROM users WHERE email=?', [email.toLowerCase()]);
        if (!u) return res.status(401).json({ error: 'Invalid email or password' });

        const valid = await bcrypt.compare(password, u.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ id: u.id, email: u.email, isAdmin: !!u.is_admin }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: userRow(u) });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

/* Get profile */
app.get('/api/auth/me', requireAuth, async (req, res) => {
    const [[u]] = await pool.query('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json(userRow(u));
});

/* Update profile */
app.put('/api/auth/me', requireAuth, async (req, res) => {
    const { name, companyName, phone, address, taxId, logo, country } = req.body;
    await pool.query(
        'UPDATE users SET name=?,company_name=?,phone=?,address=?,tax_id=?,logo=?,country=? WHERE id=?',
        [name, companyName, phone, address, taxId, logo, country, req.user.id]
    );
    res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   SETTINGS ROUTES
══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/settings', requireAuth, async (req, res) => {
    const [[row]] = await pool.query('SELECT * FROM user_settings WHERE user_id=?', [req.user.id]);
    res.json(row || {});
});

app.put('/api/settings', requireAuth, async (req, res) => {
    const { paymentType, bankName, bankAccount, bankRouting, upiId, upiName, paypalId, customUrl, notes } = req.body;
    await pool.query(`
        INSERT INTO user_settings (user_id,payment_type,bank_name,bank_account,bank_routing,upi_id,upi_name,paypal_id,custom_url,notes)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
            payment_type=VALUES(payment_type), bank_name=VALUES(bank_name),
            bank_account=VALUES(bank_account), bank_routing=VALUES(bank_routing),
            upi_id=VALUES(upi_id), upi_name=VALUES(upi_name),
            paypal_id=VALUES(paypal_id), custom_url=VALUES(custom_url), notes=VALUES(notes)
    `, [req.user.id, paymentType, bankName, bankAccount, bankRouting, upiId, upiName, paypalId, customUrl, notes]);
    res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   INVOICE ROUTES
══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/invoices', requireAuth, async (req, res) => {
    const [rows] = await pool.query(
        'SELECT * FROM invoices WHERE user_id=? ORDER BY created_at DESC', [req.user.id]
    );
    res.json(rows);
});

app.post('/api/invoices', requireAuth, async (req, res) => {
    const v = req.body;
    try {
        await pool.query(`
            INSERT INTO invoices
                (id,user_id,invoice_number,issue_date,due_date,country,
                 client_name,client_email,client_phone,client_address,client_tax_id,
                 items,subtotal,discount,tax_rate,tax_amount,grand_total,
                 payment_type,payment_data,notes,status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                invoice_number=VALUES(invoice_number), issue_date=VALUES(issue_date),
                due_date=VALUES(due_date), country=VALUES(country),
                client_name=VALUES(client_name), client_email=VALUES(client_email),
                client_phone=VALUES(client_phone), client_address=VALUES(client_address),
                client_tax_id=VALUES(client_tax_id), items=VALUES(items),
                subtotal=VALUES(subtotal), discount=VALUES(discount),
                tax_rate=VALUES(tax_rate), tax_amount=VALUES(tax_amount),
                grand_total=VALUES(grand_total), payment_type=VALUES(payment_type),
                payment_data=VALUES(payment_data), notes=VALUES(notes), status=VALUES(status)
        `, [
            v.id, req.user.id, v.invoiceNumber, v.issueDate, v.dueDate, v.country,
            v.clientName, v.clientEmail, v.clientPhone, v.clientAddress, v.clientTaxId,
            JSON.stringify(v.items||[]), v.subtotal||0, v.discount||0,
            v.taxRate||0, v.taxAmount||0, v.grandTotal||0,
            v.paymentType, JSON.stringify(v.paymentData||{}), v.notes, v.status||'outstanding'
        ]);
        res.json({ success: true, id: v.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save invoice' });
    }
});

app.put('/api/invoices/:id/status', requireAuth, async (req, res) => {
    await pool.query('UPDATE invoices SET status=? WHERE id=? AND user_id=?',
        [req.body.status, req.params.id, req.user.id]);
    res.json({ success: true });
});

app.delete('/api/invoices/:id', requireAuth, async (req, res) => {
    await pool.query('DELETE FROM invoices WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   CLIENT ROUTES
══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/clients', requireAuth, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM clients WHERE user_id=? ORDER BY name', [req.user.id]);
    res.json(rows);
});

app.post('/api/clients', requireAuth, async (req, res) => {
    const { id, name, email, phone, address, taxReg } = req.body;
    await pool.query(`
        INSERT INTO clients (id,user_id,name,email,phone,address,tax_reg)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),email=VALUES(email),
            phone=VALUES(phone),address=VALUES(address),tax_reg=VALUES(tax_reg)
    `, [id, req.user.id, name, email, phone, address, taxReg]);
    res.json({ success: true, id });
});

app.delete('/api/clients/:id', requireAuth, async (req, res) => {
    await pool.query('DELETE FROM clients WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ success: true });
});

/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════════════════ */
app.get('/api/admin/tenants', requireAdmin, async (req, res) => {
    const [rows] = await pool.query(`
        SELECT u.id, u.name, u.company_name, u.email, u.country, u.plan, u.created_at,
               COUNT(i.id) AS invoice_count
        FROM   users u
        LEFT JOIN invoices i ON i.user_id = u.id
        WHERE  u.is_admin = FALSE
        GROUP  BY u.id
        ORDER  BY u.created_at DESC
    `);
    res.json(rows);
});

app.delete('/api/admin/tenants/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM users WHERE id=? AND is_admin=FALSE', [req.params.id]);
    res.json({ success: true });
});

app.get('/api/admin/pricing', requireAdmin, async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM admin_pricing');
    const out = {};
    rows.forEach(r => { out[r.country_code] = parseFloat(r.tax_rate); });
    res.json(out);
});

app.put('/api/admin/pricing', requireAdmin, async (req, res) => {
    const pricing = req.body;
    const c = await pool.getConnection();
    try {
        await c.beginTransaction();
        for (const [code, rate] of Object.entries(pricing)) {
            await c.query(
                'INSERT INTO admin_pricing (country_code,tax_rate) VALUES (?,?) ON DUPLICATE KEY UPDATE tax_rate=VALUES(tax_rate)',
                [code, rate]
            );
        }
        await c.commit();
        res.json({ success: true });
    } catch (err) {
        await c.rollback();
        res.status(500).json({ error: 'Failed to save pricing' });
    } finally {
        c.release();
    }
});

/* ── Public pricing (no auth — tenants see admin-set tax rates) ─────────────── */
app.get('/api/public/pricing', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM admin_pricing');
    const out = {};
    rows.forEach(r => { out[r.country_code] = parseFloat(r.tax_rate); });
    res.json(out);
});

/* ── Static / SPA fallback ──────────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname)));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ── Global error handler ───────────────────────────────────────────────────── */
app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

/* ── Health check ───────────────────────────────────────────────────────────── */
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

/* ── Boot ───────────────────────────────────────────────────────────────────── */
const server = app.listen(PORT, '0.0.0.0', () =>
    console.log(`HorizonGET listening on port ${PORT}`)
);

initDB().catch(err => {
    console.error('⚠️  DB init error (server still running):', err.message);
});
