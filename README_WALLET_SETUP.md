
# Configuration des Wallets - Guide d'installation

## APIs supportées

### 1. Binance API
- **Où obtenir** : https://www.binance.com/en/my/settings/api-management
- **Secrets requis** :
  - `BINANCE_{USER_ID}_API_KEY`
  - `BINANCE_{USER_ID}_SECRET_KEY`
- **Permissions recommandées** : Lecture seule (Spot & Futures Reading)

### 2. MetaMask / Web3 Wallets
- **Infura** : https://infura.io/dashboard
- **Etherscan** : https://etherscan.io/apis
- **Secrets requis** :
  - `INFURA_PROJECT_ID`
  - `ETHERSCAN_API_KEY`

### 3. Cake Wallet
- **Documentation** : https://docs.cakewallet.com/
- **Secrets requis** :
  - `CAKE_WALLET_{USER_ID}_API_KEY`

### 4. Coinbase Pro
- **API** : https://docs.pro.coinbase.com/
- **Secrets requis** :
  - `COINBASE_{USER_ID}_API_KEY`
  - `COINBASE_{USER_ID}_SECRET_KEY`
  - `COINBASE_{USER_ID}_PASSPHRASE`

## Configuration dans Replit

1. Ouvrez l'outil **Secrets** (🔑) dans le panneau de gauche
2. Ajoutez chaque clé API avec le format : `API_NAME_USER_ID_KEY_TYPE`
3. Les utilisateurs pourront ensuite connecter leurs wallets via l'interface

## Sécurité

- Les clés API ne sont jamais stockées côté client
- Chaque utilisateur a ses propres secrets isolés
- Utilisez des permissions lecture seule quand possible
- Les secrets sont chiffrés par Replit

## Fonctionnalités disponibles

- ✅ Connexion multiple wallets par utilisateur
- ✅ Suivi des soldes en temps réel
- ✅ Historique des transactions
- ✅ Déconnexion sécurisée
- ✅ Support multi-blockchain
