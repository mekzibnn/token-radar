(function() {
  'use strict';
  const DATA = window.RADAR;
  if (!DATA) return;

  let state = {
    tab: 'pre-token',
    search: '',
    category: 'all',
    chain: 'all',
    sort: 'rank',
    dir: 1,
    selected: null
  };

  const fmt = {
    usd: n => n === null ? 'n/a' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n),
    compact: n => {
      if (n === null) return 'n/a';
      if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
      if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
      return '$' + n.toFixed(0);
    },
    pct: n => n === null ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%',
    age: d => d === null ? 'new' : (d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd')
  };

  // Re-generate farm plan logic in the page for the detail view
  function getFarmPlan(p) {
    const chain = p.chains && p.chains.length > 0 ? p.chains[0] : 'primary network';
    const capital = p.tvl_usd >= 1e9 ? 500 : (p.tvl_usd >= 1e8 ? 200 : 100);
    const cat = (p.category || '').toLowerCase();
    const name = p.name;
    const steps = [{ text: `Prepare dedicated wallet on ${chain} with $${capital} in stablecoins.`, cost: `$${Math.round(capital * 1.02)}`, time: '10m' }];
    if (cat.includes('lend') || cat.includes('cdp')) {
      steps.push({ text: `Deposit $${capital} USDC into ${name} main market.`, cost: '$5-$15 gas', time: '5m' }, { text: `Borrow $20 volatile asset to increase activity.`, cost: '$10 gas', time: '5m' }, { text: `Maintain Health Factor > 1.5 for 14 days.`, cost: 'Interest', time: '14d' });
    } else if (cat.includes('dex') || cat.includes('yield')) {
      steps.push({ text: `Add $${capital} liquidity to stable pair on ${name}.`, cost: '$10-$20 gas', time: '5m' }, { text: `Stake LP tokens in reward gauge.`, cost: '$5 gas', time: '2m' }, { text: `Perform 3 swaps over next month.`, cost: '$5 gas', time: '4w' });
    } else {
      steps.push({ text: `Interact with ${name} core vault by depositing $${capital}.`, cost: '$5-$12 gas', time: '5m' }, { text: `Keep funds deposited for 30 days.`, cost: 'Lockup', time: '30d' });
    }
    steps.push({ text: `Participate in governance votes.`, cost: 'Free', time: '5m/w' }, { text: `Monitor Discord for Early Adopter roles.`, cost: 'Time', time: '15m' });
    return steps;
  }

  function render() {
    const headerMeta = document.getElementById('header-meta');
    headerMeta.innerHTML = `<div>SNAPSHOT: ${DATA.as_of}</div><div>MODEL: ${DATA.model_version}</div>`;

    const stats = document.getElementById('stats');
    stats.innerHTML = `
      <div class="stat-card"><div class="stat-label">Watchlist</div><div class="stat-value">${DATA.watchlist_size}</div></div>
      <div class="stat-card"><div class="stat-label">Total Scored</div><div class="stat-value">${DATA.board_size}</div></div>
      <div class="stat-card"><div class="stat-label">Early Alpha</div><div class="stat-value">${DATA.early_size}</div></div>
      <div class="stat-card"><div class="stat-label">Live Tokens</div><div class="stat-value">${DATA.live_size}</div></div>
    `;

    const tableHead = document.getElementById('table-head');
    if (state.tab === 'pre-token') {
      tableHead.innerHTML = `
        <th data-sort="rank">RANK</th>
        <th data-sort="name">PROTOCOL</th>
        <th data-sort="tvl">TVL</th>
        <th data-sort="growth">7D GROWTH</th>
        <th data-sort="age">AGE</th>
        <th data-sort="implied">IMPLIED VALUE</th>
      `;
    } else {
      tableHead.innerHTML = `
        <th>STATUS</th>
        <th data-sort="name">PROTOCOL</th>
        <th data-sort="tvl">TVL</th>
        <th data-sort="growth">7D GROWTH</th>
        <th data-sort="mcap">MARKET CAP</th>
      `;
    }

    const filtered = (state.tab === 'pre-token' ? DATA.rows : DATA.live).filter(r => {
      const matchSearch = !state.search || [r.name, r.slug, r.category, ...(r.chains || [])].some(s => s && s.toLowerCase().includes(state.search.toLowerCase()));
      const matchCat = state.category === 'all' || r.category === state.category;
      const matchChain = state.chain === 'all' || (r.chains && r.chains.includes(state.chain));
      return matchSearch && matchCat && matchChain;
    });

    const sorted = filtered.sort((a, b) => {
      let av, bv;
      if (state.sort === 'name') { av = a.name; bv = b.name; }
      else if (state.sort === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (state.sort === 'growth') { av = a.change_7d || -999; bv = b.change_7d || -999; }
      else if (state.sort === 'age') { av = a.age_days || 0; bv = b.age_days || 0; }
      else if (state.sort === 'mcap') { av = a.mcap_usd || 0; bv = b.mcap_usd || 0; }
      else { av = a.rank || 0; bv = b.rank || 0; }
      return av > bv ? state.dir : (av < bv ? -state.dir : 0);
    });

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    const maxVal = state.tab === 'pre-token' ? Math.max(...DATA.rows.map(r => r.implied_value_usd)) : 0;

    sorted.forEach(r => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = () => openDetail(r.slug);
      if (state.tab === 'pre-token') {
        tr.innerHTML = `
          <td class="num">#${r.rank}</td>
          <td><span class="protocol-name">${r.name}</span><span class="protocol-tags">${r.category || 'Other'} • ${r.chains.slice(0,2).join(', ')}</span></td>
          <td class="num">${fmt.compact(r.tvl_usd)}</td>
          <td class="num ${r.change_7d >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.change_7d)}</td>
          <td class="num">${fmt.age(r.age_days)}</td>
          <td class="num">
            <div class="bar-container"><div class="bar" style="width: ${(r.implied_value_usd / maxVal * 100)}%"></div></div>
            ${fmt.compact(r.implied_value_usd)}
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td><span class="tab active" style="font-size: 0.7rem; padding: 2px 6px;">LIVE</span></td>
          <td><span class="protocol-name">${r.name}</span><span class="protocol-tags">${r.category || 'Other'} • ${r.chains.slice(0,2).join(', ')}</span></td>
          <td class="num">${fmt.compact(r.tvl_usd)}</td>
          <td class="num ${r.change_7d >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.change_7d)}</td>
          <td class="num">${fmt.compact(r.mcap_usd)}</td>
        `;
      }
      tbody.appendChild(tr);
    });
  }

  function openDetail(slug) {
    const r = (state.tab === 'pre-token' ? DATA.rows : DATA.live).find(row => row.slug === slug);
    if (!r) return;
    state.selected = slug;
    updateHash();
    
    const content = document.getElementById('modal-content');
    const plan = getFarmPlan(r);
    
    content.innerHTML = `
      <div style="margin-bottom: 2rem;">
        <h2 style="font-size: 1.5rem; color: var(--accent);">${r.name}</h2>
        <p style="color: var(--text-muted);">${r.category || 'Other'} on ${r.chains.join(', ')}</p>
      </div>
      
      <div class="detail-grid">
        <div class="detail-section">
          <h3>Market Figures</h3>
          <div class="model-row"><span>TVL</span><span>${fmt.usd(r.tvl_usd)}</span></div>
          <div class="model-row"><span>7D Change</span><span class="${r.change_7d >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.change_7d)}</span></div>
          <div class="model-row"><span>Protocol Age</span><span>${fmt.age(r.age_days)}</span></div>
          ${state.tab === 'live' ? `<div class="model-row"><span>Market Cap</span><span>${fmt.usd(r.mcap_usd)}</span></div>` : ''}
        </div>
        ${state.tab === 'pre-token' ? `
        <div class="detail-section">
          <h3>Model Breakdown</h3>
          <div class="model-row"><span>TVL (log base)</span><span>$${r.tvl_usd.toLocaleString('en-US', {maximumFractionDigits: 0})}</span></div>
          <div class="model-bar-row"><span>Growth ${r.growth_multiplier.toFixed(2)}x</span><div class="model-bar-track"><div class="model-bar" style="width:${Math.min(100, Math.round((r.growth_multiplier - 0.5) * 100))}%; background: var(--accent);"></div></div></div>
          <div class="model-bar-row"><span>Longevity ${r.longevity_multiplier.toFixed(2)}x</span><div class="model-bar-track"><div class="model-bar" style="width:${Math.min(100, Math.round((r.longevity_multiplier - 0.5) * 100))}%; background: var(--accent-soft);"></div></div></div>
          <div class="model-bar-row"><span>Category ${r.category_multiplier.toFixed(2)}x</span><div class="model-bar-track"><div class="model-bar" style="width:${Math.min(100, Math.round((r.category_multiplier - 0.5) * 100))}%; background: var(--warn);"></div></div></div>
          <div class="model-row"><span>7D growth</span><span class="${r.change_7d >= 0 ? 'pos' : 'neg'}">${fmt.pct(r.change_7d)} (damped)</span></div>
          <p class="why-ranked" style="margin-top: 0.75rem; font-size: 0.78rem; line-height: 1.5; color: var(--text-muted);">
            <strong style="color: var(--text);">Why ranked #${r.rank}:</strong> its $${fmt.usd(r.tvl_usd)} TVL anchors the log-scale base, ${(r.change_7d >= 0 ? 'growing' : 'shrinking')} ${fmt.pct(Math.abs(r.change_7d))} over 7 days, ${fmt.age(r.age_days)} of operating history, and a category factor of ${r.category_multiplier.toFixed(2)}x versus the global median.
          </p>
          <div class="model-row" style="margin-top: 0.75rem; border-top: 1px solid var(--border); padding-top: 0.5rem; font-weight: 700; color: var(--accent);">
            <span>Implied Value</span><span>${fmt.usd(r.implied_value_usd)}</span>
          </div>
        </div>` : ''}
      </div>

      <div class="farm-plan">
        <h3 style="font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 1rem;">Optimized Farm Plan</h3>
        ${plan.map((s, i) => `
          <div class="farm-step">
            <div class="step-header"><span>STEP ${i+1}</span><span>${s.time} • ${s.cost}</span></div>
            <div class="step-text">${s.text}</div>
          </div>
        `).join('')}
      </div>
    `;
    
    document.getElementById('modal-overlay').classList.add('active');
  }

  function updateHash() {
    const p = new URLSearchParams();
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.search) p.set('q', state.search);
    if (state.category !== 'all') p.set('cat', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.selected) p.set('p', state.selected);
    const h = p.toString();
    window.history.replaceState(null, '', h ? '#' + h : window.location.pathname);
  }

  function readHash() {
    const p = new URLSearchParams(window.location.hash.slice(1));
    state.tab = p.get('tab') || 'pre-token';
    state.search = p.get('q') || '';
    state.category = p.get('cat') || 'all';
    state.chain = p.get('chain') || 'all';
    state.selected = p.get('p');
    
    document.getElementById('search').value = state.search;
    document.getElementById('category-filter').value = state.category;
    document.getElementById('chain-filter').value = state.chain;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === state.tab);
    });
    
    if (state.selected) openDetail(state.selected);
    render();
  }

  // Init filters
  const cats = Array.from(new Set(DATA.rows.concat(DATA.live).map(r => r.category).filter(Boolean))).sort();
  const chains = Array.from(new Set(DATA.rows.concat(DATA.live).flatMap(r => r.chains || []))).sort();
  
  const catSel = document.getElementById('category-filter');
  cats.forEach(c => catSel.add(new Option(c, c)));
  
  const chainSel = document.getElementById('chain-filter');
  chains.forEach(c => chainSel.add(new Option(c, c)));

  // Listeners
  document.getElementById('search').oninput = e => { state.search = e.target.value; updateHash(); render(); };
  catSel.onchange = e => { state.category = e.target.value; updateHash(); render(); };
  chainSel.onchange = e => { state.chain = e.target.value; updateHash(); render(); };
  
  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      state.tab = t.dataset.tab;
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
      updateHash();
      render();
    };
  });

  document.getElementById('table-head').onclick = e => {
    const th = e.target.closest('th');
    if (!th || !th.dataset.sort) return;
    const s = th.dataset.sort;
    if (state.sort === s) state.dir *= -1;
    else { state.sort = s; state.dir = 1; }
    render();
  };

  document.getElementById('close-modal').onclick = () => {
    document.getElementById('modal-overlay').classList.remove('active');
    state.selected = null;
    updateHash();
  };

  window.onclick = e => {
    if (e.target.id === 'modal-overlay') document.getElementById('close-modal').click();
  };

  readHash();
})();
