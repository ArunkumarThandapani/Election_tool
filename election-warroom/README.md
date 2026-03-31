# Election War Room Dashboard

React + Vite frontend that pulls live Google Forms responses (via Google Sheets CSV) and renders three dashboards:

- Family Intake Dashboard: Date, Booth No, Families Met (latest per booth)
- Polling Status Dashboard: Booth No, Total Votes, Favourable Votes (latest per booth)
- Ondriyum Wise Dashboard: Booth-wise polling + ondriyum data with range filters

## Data sources

The app expects published Google Sheets and uses the following columns:

Polling Status Sheet:
- Column 1: Date
- Column 2: Email (ignored)
- Column 3: Booth No
- Column 4: Total Votes
- Column 5: Total Favourable Vote
- Validation: Total Votes must be greater than or equal to Favourable Votes

Family Canvas Sheet:
- Column 3: Date
- Column 2: Email (ignored)
- Column 4: Booth No
- Column 5: Families Met

Ondriyum Sheet:
- Column 1: Booth
- Column 2: Place
- Column 3: Male
- Column 4: Female
- Column 5: Third_Gender
- Column 6: Ondriyum
- Column 7: Exact place (optional)

## Setup

1. Publish your Google Sheets to the web as CSV.
2. Create a `.env` file in the project root:

```bash
VITE_POLLING_SHEET_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit?gid=<GID>"
VITE_FAMILY_SHEET_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit?gid=<GID>"
VITE_ONDRIYUM_SHEET_URL="https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit?gid=<GID>"
```

3. Install and run:

```bash
npm install
npm run dev
```

## Build for deployment

```bash
npm run build
```

The app is static and can be deployed to any cloud portal (Vercel, Netlify, S3, etc.).
