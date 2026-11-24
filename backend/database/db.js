const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.DB_HOST);

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chaintrack_agro',
  connectTimeout: 10000,
  ssl: isProduction
    ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      }
    : undefined,
  waitForConnections: true,
  connectionLimit: 5
});

async function initDatabase() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE,
      password VARCHAR(255),
      role VARCHAR(30),
      org_name VARCHAR(100),
      wallet_address VARCHAR(100)
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS plantations (id INT PRIMARY KEY, name VARCHAR(100), location VARCHAR(150))`);
    await conn.query(`CREATE TABLE IF NOT EXISTS warehouses (id INT PRIMARY KEY, name VARCHAR(100), location VARCHAR(150))`);
    await conn.query(`CREATE TABLE IF NOT EXISTS supermarkets (id INT PRIMARY KEY, name VARCHAR(100), location VARCHAR(150))`);

    await conn.query(`CREATE TABLE IF NOT EXISTS product_batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tracking_number VARCHAR(50) UNIQUE,
      plantation_id INT,
      warehouse_id INT,
      supermarket_id INT,
      total_weight_kg DECIMAL(10,2),
      harvest_date VARCHAR(20),
      condition_note TEXT,
      storage_location VARCHAR(150),
      status VARCHAR(50),
      offchain_hash VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS batch_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id INT,
      fruit_name VARCHAR(50),
      quantity_kg DECIMAL(10,2),
      verified_kg DECIMAL(10,2) DEFAULT 0,
      FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE CASCADE
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS tracking_histories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id INT,
      status VARCHAR(50),
      location VARCHAR(150),
      notes TEXT,
      actor_role VARCHAR(30),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await conn.query(`CREATE TABLE IF NOT EXISTS blockchain_transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      batch_id INT,
      action VARCHAR(50),
      tx_hash VARCHAR(100),
      block_number INT,
      status VARCHAR(100),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Cek & Isi Data Demonstrasi Awal
    const [rows] = await conn.query("SELECT COUNT(*) AS count FROM users");
    if (rows[0].count === 0) {
      const hash = bcrypt.hashSync('123456', 10);
      await conn.query(
        "INSERT INTO users (username, password, role, org_name, wallet_address) VALUES ?",
        [[
          ['perkebunan', hash, 'plantation', 'Perkebunan A', '0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73'],
          ['gudang', hash, 'warehouse', 'Gudang Distribusi B', '0x627306090abaB3A6e1400e9345bC60c78a8BEf57'],
          ['supermarket', hash, 'supermarket', 'Supermarket C', '0xf17f52151EbEF6c7334FAD080c5704D77216b732']
        ]]
      );

      await conn.query("INSERT IGNORE INTO plantations VALUES (1, 'Perkebunan A', 'Malang, Jawa Timur')");
      await conn.query("INSERT IGNORE INTO warehouses VALUES (1, 'Gudang Distribusi B', 'Surabaya, Jawa Timur')");
      await conn.query("INSERT IGNORE INTO supermarkets VALUES (1, 'Supermarket C', 'Jakarta Selatan')");

      await conn.query(`INSERT INTO product_batches 
        (id, tracking_number, plantation_id, warehouse_id, supermarket_id, total_weight_kg, harvest_date, condition_note, storage_location, status, offchain_hash)
        VALUES (1, 'CT-2026-001', 1, 1, 1, 300, '2026-11-24', 'Segar, Grade A, Kemasan Crate Berventilasi', 'Menunggu Pengiriman', 'Created', 'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')`);

      await conn.query(
        "INSERT INTO batch_items (batch_id, fruit_name, quantity_kg, verified_kg) VALUES ?",
        [[
          [1, 'Pisang', 100, 100],
          [1, 'Mangga', 80, 80],
          [1, 'Jeruk', 70, 70],
          [1, 'Apel', 50, 50]
        ]]
      );

      await conn.query(`INSERT INTO tracking_histories (batch_id, status, location, notes, actor_role)
        VALUES (1, 'Created', 'Perkebunan A', 'Inisialisasi Batch CT-2026-001 (Total 300 kg)', 'plantation')`);

      await conn.query(`INSERT INTO blockchain_transactions (batch_id, action, tx_hash, block_number, status)
        VALUES (1, 'CREATE_BATCH', '0x7a9d8532c1b4e8f9a0d2c3b4a5e6f7890123456789abcdef0123456789abcdef', 102, 'CONFIRMED (Besu QBFT)')`);
    }
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDatabase };