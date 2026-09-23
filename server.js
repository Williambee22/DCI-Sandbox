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

const base = names.map((name, i) => {

  /*
    Create general competitive bubbles.

    Corps are NOT given an exact predetermined score.

    Every new/reset universe gets variation while
    maintaining noticeable gaps between groups.
  */

  const bubble = Math.floor(i / 5);

  let minScore;
  let maxScore;

  if (bubble === 0) {
    // Top group
    minScore = 72;
    maxScore = 76;
  }
  else if (bubble === 1) {
    // Upper-middle group
    minScore = 65;
    maxScore = 71;
  }
  else if (bubble === 2) {
    // Lower-middle group
    minScore = 58;
    maxScore = 64;
  }
  else {
    // Lower group
    minScore = 50;
    maxScore = 57;
  }

  // Random starting score inside that corps' bubble
  const score =
    minScore +
    Math.random() * (maxScore - minScore);

  /*
    Strength is separate from current score.

    This controls the corps' long-term competitive
    potential instead of directly being its score.
  */

  const strength = Math.max(
    40,
    Math.min(
      100,
      score + 14 + (Math.random() * 6 - 3)
    )
  );

  return {
    id: i + 1,
    name,

    cash:
      900000 +
      Math.round(Math.random() * 900000),

    management:
      55 + Math.round(Math.random() * 35),

    staff:
      Math.max(
        40,
        Math.min(
          100,
          Math.round(strength + (Math.random() * 10 - 5))
        )
      ),

    recruiting:
      Math.max(
        40,
        Math.min(
          100,
          Math.round(strength + (Math.random() * 12 - 6))
        )
      ),

    design:
      Math.max(
        40,
        Math.min(
          100,
          Math.round(strength + (Math.random() * 12 - 6))
        )
      ),

    morale:
      65 + Math.round(Math.random() * 25),

    stability:
      65 + Math.round(Math.random() * 25),

    strength: +strength.toFixed(2),

    score: +score.toFixed(3),

    status: 'ACTIVE'
  };
});

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


app.post('/api/corps', async (req, res) => {
  const name = String(req.body.name || '').trim();

  if (!name) {
    return res.status(400).json({
      error: 'Corps name is required.'
    });
  }

  // Prevent duplicate corps names
  const exists = mem.corps.some(
    c => c.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    return res.status(400).json({
      error: 'A corps with that name already exists.'
    });
  }

  // Find next available ID
  const newId =
    mem.corps.length > 0
      ? Math.max(...mem.corps.map(c => Number(c.id))) + 1
      : 1;

  const newCorps = {
    id: newId,
    name,

    // Default finances
    cash: 1000000,

    // Default organizational stats
    management: 60,
    staff: 60,
    recruiting: 60,
    design: 60,
    morale: 60,
    stability: 60,

    // Default long-term strength
    strength: 60,

    // New corps starts somewhere in this range
    score: +(50 + Math.random() * 10).toFixed(3),

    status: 'ACTIVE',

    // Useful later for tracking expansion corps
    founded: mem.year
  };

  mem.corps.push(newCorps);

  // Add the corps to the current graph starting NOW.
  // It won't appear historically before it existed.
  if (mem.history.length > 0) {
    const current = mem.history[mem.history.length - 1];

    if (current && current.scores) {
      current.scores[newId] = newCorps.score;
    }
  }

  await save();

  res.status(201).json(newCorps);
});

app.post('/api/new-season', async (req, res) => {
  mem.year++;
  mem.day = 0;
  mem.active = false;
  mem.history = [];

  for (const c of mem.corps) {

    if (c.status !== 'ACTIVE') {
      continue;
    }

    // Offseason organization changes
    c.cash += Math.round(
      (c.management - 50) * 12000
    );

    c.morale = Math.max(
      0,
      Math.min(
        100,
        c.morale + (Math.random() * 6 - 3)
      )
    );

    c.stability = Math.max(
      0,
      Math.min(
        100,
        c.stability + (Math.random() * 6 - 3)
      )
    );

    /*
      Persistent corps strength changes based on
      how well the organization is being operated.
    */

    const organizationalQuality =
      (
        c.management +
        c.staff +
        c.recruiting +
        c.design +
        c.morale +
        c.stability
      ) / 6;

    const strengthChange =
      (organizationalQuality - 70) / 20 +
      (Math.random() * 2 - 1);

    c.strength = Math.max(
      35,
      Math.min(
        100,
        (c.strength || c.score) + strengthChange
      )
    );

    /*
      Competition score DOES reset.

      Strong corps still begin ahead of weak corps,
      but nobody starts a new season at 98.
    */

    c.score =
      49 +
      c.strength * 0.30 +
      (Math.random() * 1.5 - 0.75);

    c.score = Math.max(
      50,
      Math.min(
        85,
        +c.score.toFixed(3)
      )
    );
  }

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
