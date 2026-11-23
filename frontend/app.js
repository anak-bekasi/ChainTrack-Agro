const token = localStorage.getItem('ct_token');
const user = JSON.parse(localStorage.getItem('ct_user') || 'null');

if (!token || !user) {
  window.location.href = '/index.html';
}

document.getElementById('orgBadge').textContent = `${user.org_name} (${user.role.toUpperCase()})`;
document.getElementById('walletBadge').textContent = `Wallet: ${user.wallet}`;

if (user.role === 'plantation') {
  document.getElementById('plantationCreatePanel').classList.remove('hidden');
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

async function loadBatches() {
  const res = await fetch('/api/batches', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const batches = await res.json();
  const container = document.getElementById('batchesContainer');
  container.innerHTML = '';

  batches.forEach(batch => {
    const itemsHtml = batch.items.map(item => `
      <div class="bg-slate-950 p-3 rounded-lg border border-slate-800 flex justify-between items-center">
        <div>
          <p class="font-semibold text-sm">${item.fruit_name}</p>
          <p class="text-xs text-slate-400">Awal: ${item.quantity_kg} kg</p>
        </div>
        <div class="text-right">
          <span class="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            Terverifikasi: ${item.verified_kg} kg
          </span>
        </div>
      </div>
    `).join('');

    const historyHtml = batch.histories.map(h => `
      <div class="border-l-2 border-emerald-500 pl-3 py-1">
        <p class="text-xs font-bold text-emerald-400">${h.status} — <span class="text-slate-300">${h.location}</span></p>
        <p class="text-xs text-slate-400">${h.notes}</p>
        <p class="text-[11px] text-slate-500">${h.timestamp} (${h.actor_role})</p>
      </div>
    `).join('');

    const txHtml = batch.transactions.map(tx => `
      <div class="text-xs bg-slate-950 p-2.5 rounded border border-slate-800 font-mono break-all">
        <div class="flex justify-between text-amber-400 font-sans font-semibold mb-1">
          <span>${tx.action}</span>
          <span>Block #${tx.block_number}</span>
        </div>
        <p class="text-slate-400 text-[11px]">Hash: ${tx.tx_hash}</p>
        <p class="text-emerald-500 font-sans text-[11px] mt-0.5">${tx.status}</p>
      </div>
    `).join('');

    const actionButtons = renderRoleActions(batch);

    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-5';
    card.innerHTML = `
      <div class="flex flex-wrap justify-between items-start gap-4 border-b border-slate-800 pb-4">
        <div>
          <div class="flex items-center gap-3">
            <h3 class="text-xl font-bold text-white">${batch.tracking_number}</h3>
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              ${batch.status}
            </span>
          </div>
          <p class="text-xs text-slate-400 mt-1">
            Asal: <b>${batch.plantation_name}</b> → Gudang: <b>${batch.warehouse_name}</b> → Tujuan: <b>${batch.supermarket_name}</b>
          </p>
          <p class="text-xs text-slate-400 mt-0.5">
            Panen: ${batch.harvest_date} | Kondisi: ${batch.condition_note} | Lokasi Penyimpanan: <span class="text-emerald-400">${batch.storage_location}</span>
          </p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-emerald-400">${batch.total_weight_kg} kg</p>
          <p class="text-[11px] font-mono text-slate-500">Doc Hash: ${batch.offchain_hash.slice(0, 24)}...</p>
        </div>
      </div>

      <!-- Komposisi Buah -->
      <div>
        <h4 class="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Komposisi Buah-buahan Campuran (${batch.items.length} Jenis)</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">${itemsHtml}</div>
      </div>

      <!-- Panel Aksi Organisasi -->
      ${actionButtons}

      <!-- Riwayat & Blockchain -->
      <div class="grid md:grid-cols-2 gap-6 pt-2">
        <div>
          <h4 class="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Riwayat Tracking Distribusi</h4>
          <div class="space-y-3">${historyHtml}</div>
        </div>
        <div>
          <h4 class="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Bukti Transaksi Blockchain</h4>
          <div class="space-y-2 max-h-60 overflow-y-auto">${txHtml}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderRoleActions(batch) {
  if (user.role === 'plantation') {
    if (batch.status === 'Created') {
      return `<div class="bg-slate-800/60 p-4 rounded-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">Tahap 1: Catat proses panen & pengemasan sebelum pengiriman.</span>
        <button onclick="updateStatus(${batch.id}, 'HarvestedAndPacked', 'Perkebunan A', 'Panen selesai & dikemas dalam crate berventilasi')"
          class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs">
          Catat Panen & Pengemasan
        </button>
      </div>`;
    }
    if (batch.status === 'HarvestedAndPacked') {
      return `<div class="bg-slate-800/60 p-4 rounded-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">Tahap 2: Kirim batch ke Gudang Distribusi B.</span>
        <button onclick="updateStatus(${batch.id}, 'ShippedToWarehouse', 'Perjalanan ke Gudang B', 'Armada truk berpendingin berangkat menuju Gudang Distribusi B')"
          class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs">
          Kirim Batch ke Gudang
        </button>
      </div>`;
    }
  }

  if (user.role === 'warehouse') {
    if (batch.status === 'ShippedToWarehouse') {
      return `<div class="bg-slate-800/60 p-4 rounded-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">Tahap 3: Terima batch & verifikasi total berat 300 kg di Gudang B.</span>
        <button onclick="updateStatus(${batch.id}, 'ReceivedAtWarehouse', 'Gudang Distribusi B', 'Diterima di Gudang B. Kuantitas 4 jenis buah (300 kg) sesuai & kondisi segar', 'Cold Storage Zone B-04')"
          class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs">
          Terima & Verifikasi Kuantitas
        </button>
      </div>`;
    }
    if (batch.status === 'ReceivedAtWarehouse') {
      return `<div class="bg-slate-800/60 p-4 rounded-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">Tahap 4: Kirim batch dari Cold Storage Zone B-04 ke Supermarket C.</span>
        <button onclick="updateStatus(${batch.id}, 'ShippedToSupermarket', 'Perjalanan ke Supermarket C', 'Dikirim dari Cold Storage Zone B-04 menuju Supermarket C', 'Dalam Pengiriman ke Supermarket')"
          class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs">
          Kirim ke Supermarket
        </button>
      </div>`;
    }
  }

  if (user.role === 'supermarket') {
    if (batch.status === 'ShippedToSupermarket') {
      return `<div class="bg-slate-800/60 p-4 rounded-lg border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm">Tahap Final: Cocokkan jumlah (300 kg) & konfirmasi penerimaan di Supermarket C.</span>
        <button onclick="updateStatus(${batch.id}, 'Completed', 'Supermarket C', 'Produk diterima & diverifikasi lengkap oleh Supermarket C. Siklus Selesai.', 'Display Buah Segar Supermarket C')"
          class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold rounded-lg text-xs">
          Konfirmasi Penerimaan (Completed)
        </button>
      </div>`;
    }
  }

  return '';
}

async function updateStatus(batchId, status, location, notes, storage_location = null) {
  const res = await fetch(`/api/batches/${batchId}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status, location, notes, storage_location })
  });
  const data = await res.json();
  if (res.ok) {
    loadBatches();
  } else {
    alert(data.error);
  }
}

document.getElementById('createBatchForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    tracking_number: document.getElementById('newTrackingNumber').value,
    harvest_date: document.getElementById('newHarvestDate').value,
    condition_note: document.getElementById('newCondition').value,
    items: [
      { fruit_name: 'Pisang', quantity_kg: Number(document.getElementById('qtyPisang').value) },
      { fruit_name: 'Mangga', quantity_kg: Number(document.getElementById('qtyMangga').value) },
      { fruit_name: 'Jeruk', quantity_kg: Number(document.getElementById('qtyJeruk').value) },
      { fruit_name: 'Apel', quantity_kg: Number(document.getElementById('qtyApel').value) }
    ]
  };

  const res = await fetch('/api/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (res.ok) {
    loadBatches();
  } else {
    alert(data.error);
  }
});

loadBatches();