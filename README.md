# Homestorage
## Idea
Money Saving and Food Waste reduction.
Shopping List with maybe automated Items on it.
Selfhosted
Maybe VPN to Connect
Shopping List sorted after place where to find it.
    Aktionen / Saisonflächen (Paletten, Promo-Inseln, Themenwochen)
git
- Blumen / Pflanzen (häufig direkt am Eingang)

- Früchte & Gemüse (meist der erste “richtige” Bereich)

- Backwaren / Brot / Patisserie (oft in Eingangs-Nähe oder gleich nach Frische)

- Frische Convenience (Salate to go, Fresh-Cuts, Sandwiches; je nach Laden)

- Kühlregal “Basic”: Milchprodukte / Joghurt / Käse (oft am Rand, manchmal weiter hinten)

- Fleisch / Fisch (Bedientheke oder Selbstbedienung; ebenfalls häufig am Rand)

- Charcuterie / Aufschnitt / Feinkost (je nach Laden neben Fleisch/Käse)

- Grundnahrungsmittel in den Gängen (typisch in dieser internen Logik):

- Pasta / Reis / Hülsenfrüchte

- Konserven / Saucen / Gewürze / Öl & Essig

- Backen (Mehl, Zucker, Backpulver, etc.)

- Frühstück (Müesli, Cereals, Konfi, Honig)

- Kaffee / Tee / Kakao

- Snacks / Süssigkeiten / Chips

- Internationale Küche (Asia, Mexiko usw., falls vorhanden)

- Getränke (Wasser, Softdrinks, Bier; Wein oft separat/nahe Rand)

- Tiefkühl (Gemüse TK, Glacé, Fertigmenüs; häufig Richtung Kassenbereich oder Seitenwand)

- Non-Food / Drogerie / Haushalt (Reiniger, Papier, Körperpflege; oft Richtung “hinten” oder nahe Kassen)

- Kasse & Impulszone (Schoggi, Kaugummi, Batterien, Rasierklingen, kleine Aktionen)

## Development
VS Code with Live Server and Codex Extension

## Backend Setup
- Install dependencies: `npm install`
- Create `.env` with your database connection and optional settings
- Run the migration: `npm run migrate`
- Start the server: `npm run dev`
- Open `http://localhost:3000`

Example `.env`:
```
DATABASE_URL=postgresql://homestorage:change_me_long_password@192.168.0.33:5432/homestorage
PORT=3000
```

Optional environment variables:
- `CORS_ORIGIN` to enable CORS for a specific origin
- `REQUEST_LOG=true` for HTTP request logs

Notes:
- Static files are served from `public/`
- The frontend persists its data via `/api/state`
