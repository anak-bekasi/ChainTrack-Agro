const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, initDatabase } = require('./database/db');
const { recordOnBlockchain } = require('./services/blockchainService');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'chaintrack_agro_secret_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

if (process.env.NODE_ENV !== 'production') {
  initDatabase().catch(err => console.error('Gagal koneksi MySQL:', err.message));
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token tidak ditemukan' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid' });
  }
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [users] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    const user = users[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Username atau password salah' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, org_name: user.org_name, wallet: user.wallet_address },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { username: user.username, role: user.role, org_name: user.org_name, wallet: user.wallet_address } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error: ' + err.message });
  }
});

app.get('/api/batches', authMiddleware, async (req, res) => {
  const [batches] = await pool.query(`
    SELECT b.*, p.name AS plantation_name, w.name AS warehouse_name, s.name AS supermarket_name
    FROM product_batches b
    LEFT JOIN plantations p ON b.plantation_id = p.id
    LEFT JOIN warehouses w ON b.warehouse_id = w.id
    LEFT JOIN supermarkets s ON b.supermarket_id = s.id
    ORDER BY b.id DESC
  `);

  for (const batch of batches) {
    const [items] = await pool.query("SELECT * FROM batch_items WHERE batch_id = ?", [batch.id]);
    const [histories] = await pool.query("SELECT * FROM tracking_histories WHERE batch_id = ? ORDER BY id ASC", [batch.id]);
    const [txs] = await pool.query("SELECT * FROM blockchain_transactions WHERE batch_id = ? ORDER BY id ASC", [batch.id]);
    batch.items = items;
    batch.histories = histories;
    batch.transactions = txs;
  }
  res.json(batches);
});

app.post('/api/batches', authMiddleware, async (req, res) => {
  if (req.user.role !== 'plantation') return res.status(403).json({ error: 'Akses khusus Perkebunan' });

  const { tracking_number, harvest_date, condition_note, items } = req.body;
  const totalWeight = items.reduce((sum, item) => sum + Number(item.quantity_kg), 0);
  const offchainHash = 'sha256:' + crypto.createHash('sha256').update(`${tracking_number}-${harvest_date}-${condition_note}`).digest('hex');

  const bcResult = await recordOnBlockchain('plantation', 'CREATE_BATCH', { tracking_number, totalWeight, items, offchainHash });

  try {
    const [result] = await pool.query(
      `INSERT INTO product_batches (tracking_number, plantation_id, warehouse_id, supermarket_id, total_weight_kg, harvest_date, condition_note, storage_location, status, offchain_hash)
       VALUES (?, 1, 1, 1, ?, ?, ?, 'Area Panen Perkebunan A', 'Created', ?)`,
      [tracking_number, totalWeight, harvest_date, condition_note, offchainHash]
    );
    const batchId = result.insertId;

    const itemValues = items.map(i => [batchId, i.fruit_name, i.quantity_kg, i.quantity_kg]);
    await pool.query("INSERT INTO batch_items (batch_id, fruit_name, quantity_kg, verified_kg) VALUES ?", [itemValues]);

    await pool.query(
      "INSERT INTO tracking_histories (batch_id, status, location, notes, actor_role) VALUES (?, 'Created', 'Perkebunan A', ?, 'plantation')",
      [batchId, `Batch dibuat (${items.length} jenis buah, total ${totalWeight} kg)`]
    );

    await pool.query(
      "INSERT INTO blockchain_transactions (batch_id, action, tx_hash, block_number, status) VALUES (?, 'CREATE_BATCH', ?, ?, ?)",
      [batchId, bcResult.txHash, bcResult.blockNumber, bcResult.status]
    );

    res.json({ message: 'Batch berhasil dibuat dan dicatat di blockchain', txHash: bcResult.txHash });
  } catch (err) {
    res.status(400).json({ error: 'Nomor batch sudah terdaftar atau data tidak valid' });
  }
});

app.post('/api/batches/:id/status', authMiddleware, async (req, res) => {
  const batchId = req.params.id;
  const { status, location, notes, storage_location, verified_items } = req.body;

  const bcResult = await recordOnBlockchain(req.user.role, `STATUS_${status.toUpperCase()}`, { batchId, status, location, notes });

  await pool.query(
    `UPDATE product_batches SET status = ?, storage_location = COALESCE(?, storage_location) WHERE id = ?`,
    [status, storage_location || null, batchId]
  );

  if (Array.isArray(verified_items)) {
    for (const vi of verified_items) {
      await pool.query("UPDATE batch_items SET verified_kg = ? WHERE id = ?", [vi.verified_kg, vi.id]);
    }
  }

  await pool.query(
    "INSERT INTO tracking_histories (batch_id, status, location, notes, actor_role) VALUES (?, ?, ?, ?, ?)",
    [batchId, status, location, notes, req.user.role]
  );

  await pool.query(
    "INSERT INTO blockchain_transactions (batch_id, action, tx_hash, block_number, status) VALUES (?, ?, ?, ?, ?)",
    [batchId, `UPDATE_${status.toUpperCase()}`, bcResult.txHash, bcResult.blockNumber, bcResult.status]
  );

  res.json({ message: `Status berhasil diperbarui ke ${status}`, txHash: bcResult.txHash });
});

app.get('/api/verify/:txHash', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.*, b.tracking_number, b.total_weight_kg, b.status AS current_batch_status, b.offchain_hash
    FROM blockchain_transactions t
    JOIN product_batches b ON t.batch_id = b.id
    WHERE t.tx_hash = ?
  `, [req.params.txHash]);

  if (rows.length === 0) return res.status(404).json({ valid: false, message: 'Hash transaksi tidak ditemukan di ledger' });
  res.json({ valid: true, record: rows[0] });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
}

// Wajib ada untuk Vercel
module.exports = app;