# Stadt Land Kündigungsgrund

Ein lustiges Multiplayer-Partyspiel, basierend auf dem Klassiker "Stadt Land Fluss" – aber mit unerwarteten, kreativen Kategorien, die für garantierte Lacher sorgen.

## Spielprinzip

### Raum erstellen / beitreten
- Eine Person erstellt einen Raum und wird automatisch zum Host
- Weitere Spieler treten über einen Einladungslink oder Raumcode bei

### Ablauf einer Runde
1. Ein zufälliger Buchstabe wird ausgewählt
2. Alle Spieler sehen dieselben Kategorien und füllen ihre Antworten aus
3. Ein Timer läuft – wer zuerst fertig ist, kann auf **Stopp** drücken
4. Nach dem Stopp werden alle Antworten eingesammelt und ausgewertet

### Punktevergabe
| Situation | Punkte |
|---|---|
| Einzigartige, gültige Antwort | 10 Punkte |
| Gleiche Antwort wie ein anderer Spieler | 5 Punkte |
| Keine oder ungültige Antwort | 0 Punkte |

### Mehrere Runden
- Das Spiel läuft über mehrere Runden
- Die Punkte werden über alle Runden hinweg akkumuliert
- Am Ende gewinnt, wer den höchsten Gesamtpunktestand hat

## Features

- **Echtzeit-Multiplayer** via Socket.io
- **KI-Auswertung:** Ähnlichkeitsprüfung – gleiche Antworten werden automatisch erkannt und mit 5 Punkten bewertet
- **KI-Kategorienvalidierung:** Die KI prüft, ob eine Antwort tatsächlich zur Kategorie passt
- **KI-Kategorienvorschläge:** Lustige und ungewöhnliche Kategorien werden von der KI generiert
- **Veto-Button:** Der Host kann eine KI-Entscheidung überschreiben *(in Entwicklung)*
- **Highscore-Board:** Punktestand über alle Runden sichtbar

## Tech-Stack

- **Backend:** Node.js + Express + Socket.io
- **Frontend:** HTML / CSS / Vanilla JS
- **KI:** Anthropic API (Claude Haiku)
- **Hosting:** Railway.app

## Lokal ausführen

```bash
git clone https://github.com/JuliaKadauke/syrus_test.git
cd syrus_test
npm install
PORT=3001 npm start
# → http://localhost:3001
```

> **Hinweis:** Port 3001 verwenden, da Port 3000 ggf. durch andere Tools belegt ist.

## Live-Version

Das Spiel ist erreichbar unter: https://stadtlandkuendigungsgrund.up.railway.app
