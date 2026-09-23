const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false
    })
  : null;

const names = [
  'Blue Devils',
  'Bluecoats',
  'Boston Crusaders',
  'The Cadets',
  'Carolina Crown',
  'Santa Clara Vanguard',
  'Phantom Regiment',
  'The Cavaliers',
  'Mandarins',
  'Colts',
  'Troopers',
  'Blue Stars',
  'Madison Scouts',
  'Crossmen',
  'Spirit of Atlanta',
  'Pacific Crest',
  'The Academy',
  'Music City',
  'Genesis',
  'Seattle Cascades'
];

const base = names.map((name, i) => ({
  id: i + 1,
  name,
  cash: 1500000 - i * 35000,
  management: 78 - (i % 9),
  staff: 82 - (i % 7),
  recruiting: 80 - (i % 11),
  design: 84 - (i % 10),
  morale: 80,
  stability: 82,
  score: 68 + Math.max(0, 15 - i) * 0.45,
  status: 'ACTIVE'
}));

let mem = {
  year: 2027,
  day: 0,
  active: false,
  corps: base,
  history: []
};

async function init() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sandbox_state (
      id int primary key,
      state jsonb not null
    )
  `);

  const r = await pool.query(
    'SELECT state FROM sandbox_state WHERE id=1'
  );

  if (r.rows[0]) {
    mem = r.rows[0].state;
  } else {
    await save();
  }
}

async function save() {
  if (pool) {
    await pool.query(
      `
      INSERT INTO sandbox_state(id, state)
      VALUES(1, $1)
      ON CONFLICT(id)
      DO UPDATE SET state=$1
      `,
      [JSON.stringify(mem)]
    );
  }
}

function step() {
  mem.day++;

  for (const c of mem.corps) {
    if (c.status !== 'ACTIVE') continue;

    const org =
      (
        c.management +
        c.staff +
        c.recruiting +
        c.design +
        c.morale +
        c.stability
      ) / 6;

    const noise = (Math.random() - 0.5) * 1.15;

    const growth =
      0.10 +
      (org - 50) / 330 +
      noise * 0.22;

    c.score = Math.max(
      45,
      Math.min(100, c.score + growth)
    );

    c.cash += Math.round(
      (c.management - 62) * 500 -
      Math.max(0, 80 - c.stability) * 850 +
      (Math.random() - 0.52) * 22000
    );

    c.morale = Math.max(
      0,
      Math.min(
        100,
        c.morale +
        (c.score > 82 ? 0.25 : -0.05) +
        (Math.random() - 0.5)
      )
    );

    c.stability = Math.max(
      0,
      Math.min(
        100,
        c.stability +
        (c.management - 50) / 300 +
        (Math.random() - 0.5) * 0.5
      )
    );

    // Corps can fold from catastrophic finances
    // or extremely poor organizational health.
    if (
      c.cash < -650000 ||
      (c.stability < 15 && c.management < 20)
    ) {
      c.status = 'FOLDED';
    }

    c.score = +c.score.toFixed(3);
  }

  mem.history.push({
    year: mem.year,
    day: mem.day,
    scores: Object.fromEntries(
      mem.corps.map(c => [c.id, c.score])
    )
  });

  if (mem.day >= 45) {
    mem.active = false;
  }
}


// ============================
// API
// ============================

app.get('/api/state', (req, res) => {
  res.json(mem);
});


app.post('/api/control/:id', async (req, res) => {
  const c = mem.corps.find(
    x => x.id == req.params.id
  );

  if (!c) {
    return res.sendStatus(404);
  }

  for (const k of [
    'cash',
    'management',
    'staff',
    'recruiting',
    'design',
    'morale',
    'stability',
    'score'
  ]) {
    if (req.body[k] != null) {
      c[k] = Number(req.body[k]);
    }
  }

  if (req.body.status) {
    c.status = req.body.status;
  }

  await save();

  res.json(c);
});


app.post('/api/step', async (req, res) => {
  let n = Math.max(
    1,
    Math.min(20, Number(req.body.days) || 1)
  );

  while (n-- && mem.day < 45) {
    step();
  }

  await save();

  res.json(mem);
});


app.post('/api/new-season', async (req, res) => {
  mem.year++;
  mem.day = 0;
  mem.active = false;
  mem.history = [];

  for (const c of mem.corps) {
    if (c.status === 'ACTIVE') {

      // Keep the previous season's ending score.
      // Do NOT reset/recalculate c.score.

      // Offseason financial change
      c.cash += Math.round(
        (c.management - 50) * 12000
      );

      // Small offseason organizational changes
      c.morale = Math.max(
        0,
        Math.min(
          100,
          c.morale + (Math.random() * 4 - 2)
        )
      );

      c.stability = Math.max(
        0,
        Math.min(
          100,
          c.stability + (Math.random() * 4 - 2)
        )
      );
    }
  }

  // Create the starting point for the new season graph
  mem.history.push({
    year: mem.year,
    day: 0,
    scores: Object.fromEntries(
      mem.corps.map(c => [c.id, c.score])
    )
  });

  await save();

  res.json(mem);
});

app.post('/api/reset', async (req, res) => {
  mem = {
    year: 2027,
    day: 0,
    active: false,
    corps: JSON.parse(JSON.stringify(base)),
    history: []
  };

  await save();

  res.json(mem);
});


// ============================
// FRONTEND FALLBACK
// ============================
//
// Express 5 does NOT support:
// app.get('*', ...)
//
// This middleware handles anything that wasn't
// matched above and serves the frontend.
//

app.use((req, res) => {
  res.sendFile(
    path.join(__dirname, 'public', 'index.html')
  );
});


// ============================
// START SERVER
// ============================

init()
  .then(() => {
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(
        `DCI Sandbox running on port ${PORT}`
      );
    });
  })
  .catch(err => {
    console.error(
      'Failed to initialize DCI Sandbox:',
      err
    );

    process.exit(1);
  });
