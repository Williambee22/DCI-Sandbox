# DCI Sandbox

Railway-ready Node/Express/PostgreSQL sandbox simulator.

## Railway
1. Create a new Railway project from this folder/repository.
2. Add a PostgreSQL service.
3. Railway supplies `DATABASE_URL` to the app when connected.
4. Deploy. The app uses `npm start` and Railway's `PORT` automatically.

## Local
`npm install && npm start`

Without DATABASE_URL it runs in memory for testing.

## Included v1
- 19 starting corps
- God Mode organization controls
- finances, management, staff, recruiting, design, morale, stability
- score progression and animated season line chart
- live standings
- folding/revival
- 45-day seasons
- persistent PostgreSQL universe
- multi-season advancement
