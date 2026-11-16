
```bash
cd shared && npm ci && cd ..       # dépendances de test de la logique commune
cd extension
npm ci                              # lance aussi `wxt prepare`
npm run dev                         # Chromium, rechargement à chaud (navigateur lancé par WXT)
npm run dev:firefox                 # Firefox
npm run build                       # .output/chrome-mv3
npm run build:firefox               # .output/firefox-mv3
npm run zip                         # .output/epitime-extension-<version>-chrome.zip (Chrome Web Store, Edge Add-ons)
npm run zip:firefox                 # .output/epitime-extension-<version>-firefox.zip + -sources.zip (Firefox Add-ons)
npm test                            # tests Node (session, API, synchronisation)
npm run compile                     # vérification TypeScript
npx web-ext lint --source-dir .output/firefox-mv3   # validation addons-linter (celle d'AMO)
```
