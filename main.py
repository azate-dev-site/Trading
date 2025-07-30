
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List
import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn
from wallet_manager import wallet_manager

app = FastAPI(title="Crypto Trading Dashboard")

# Monter les fichiers statiques
app.mount("/static", StaticFiles(directory="static"), name="static")

# Store pour les connexions WebSocket
connections: List[WebSocket] = []

# Modèles Pydantic pour les wallets
class WalletConnectionRequest(BaseModel):
    wallet_type: str
    api_key: Optional[str] = None
    secret_key: Optional[str] = None
    wallet_address: Optional[str] = None
    infura_project_id: Optional[str] = None
    testnet: Optional[bool] = False

class WalletDisconnectRequest(BaseModel):
    wallet_type: str

# Cache pour les données crypto
crypto_data: Dict = {}

# Liste des cryptos à suivre
CRYPTOS = [
    "bitcoin", "ethereum", "binancecoin", "cardano", "solana", "dogecoin", 
    "polygon", "chainlink", "litecoin", "avalanche-2", "uniswap", "polkadot",
    "near", "cosmos", "algorand", "tron", "stellar", "filecoin", "vechain",
    "hedera-hashgraph", "internet-computer", "the-sandbox"
]

async def fetch_historical_data():
    """Récupère les données historiques d'une année pour toutes les cryptos"""
    async with aiohttp.ClientSession() as session:
        for crypto_id in CRYPTOS:
            try:
                # Données historiques des 365 derniers jours
                url = f"https://api.coingecko.com/api/v3/coins/{crypto_id}/market_chart?vs_currency=usd&days=365&interval=daily"
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        if crypto_id not in crypto_data:
                            crypto_data[crypto_id] = {
                                "prices": [],
                                "timestamps": [],
                                "historical_prices": [],
                                "historical_timestamps": [],
                                "current": {},
                                "stats": {}
                            }
                        
                        # Traiter les données historiques
                        prices = data.get("prices", [])
                        for price_data in prices:
                            timestamp = datetime.fromtimestamp(price_data[0] / 1000)
                            price = price_data[1]
                            crypto_data[crypto_id]["historical_prices"].append(price)
                            crypto_data[crypto_id]["historical_timestamps"].append(timestamp.isoformat())
                        
                        print(f"Données historiques chargées pour {crypto_id}: {len(prices)} points")
                        
                await asyncio.sleep(0.1)  # Éviter de surcharger l'API
            except Exception as e:
                print(f"Erreur lors de la récupération des données historiques pour {crypto_id}: {e}")

async def fetch_crypto_data():
    """Récupère les données actuelles des cryptos"""
    async with aiohttp.ClientSession() as session:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(CRYPTOS)}&vs_currencies=usd,eur&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true"
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    timestamp = datetime.now().isoformat()
                    
                    for crypto_id, crypto_info in data.items():
                        if crypto_id not in crypto_data:
                            crypto_data[crypto_id] = {
                                "prices": [],
                                "timestamps": [],
                                "historical_prices": [],
                                "historical_timestamps": [],
                                "current": {},
                                "stats": {}
                            }
                        
                        # Ajouter le prix actuel à l'historique temps réel
                        crypto_data[crypto_id]["prices"].append(crypto_info.get("usd", 0))
                        crypto_data[crypto_id]["timestamps"].append(timestamp)
                        crypto_data[crypto_id]["current"] = crypto_info
                        
                        # Calculer des statistiques
                        current_price = crypto_info.get("usd", 0)
                        historical_prices = crypto_data[crypto_id]["historical_prices"]
                        
                        if historical_prices:
                            year_ago_price = historical_prices[0] if historical_prices else current_price
                            year_change = ((current_price - year_ago_price) / year_ago_price * 100) if year_ago_price > 0 else 0
                            max_year = max(historical_prices) if historical_prices else current_price
                            min_year = min(historical_prices) if historical_prices else current_price
                            
                            crypto_data[crypto_id]["stats"] = {
                                "year_change": year_change,
                                "year_high": max_year,
                                "year_low": min_year,
                                "market_cap": crypto_info.get("usd_market_cap", 0)
                            }
                        
                        # Garder les 1000 derniers points pour le temps réel
                        if len(crypto_data[crypto_id]["prices"]) > 1000:
                            crypto_data[crypto_id]["prices"] = crypto_data[crypto_id]["prices"][-1000:]
                            crypto_data[crypto_id]["timestamps"] = crypto_data[crypto_id]["timestamps"][-1000:]
                    
                    return data
        except Exception as e:
            print(f"Erreur lors de la récupération des données: {e}")
    return None

async def broadcast_data():
    """Diffuse les données à tous les clients connectés"""
    if crypto_data and connections:
        message = {
            "type": "crypto_update",
            "data": crypto_data,
            "timestamp": datetime.now().isoformat()
        }
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except:
                disconnected.append(connection)
        
        # Nettoyer les connexions fermées
        for connection in disconnected:
            connections.remove(connection)

async def crypto_updater():
    """Tâche en arrière-plan pour mettre à jour les données crypto"""
    # Charger les données historiques au démarrage
    await fetch_historical_data()
    
    while True:
        await fetch_crypto_data()
        await broadcast_data()
        await asyncio.sleep(1)  # Mise à jour chaque seconde

@app.on_event("startup")
async def startup_event():
    # Démarrer la tâche de mise à jour des cryptos
    asyncio.create_task(crypto_updater())

@app.get("/", response_class=HTMLResponse)
async def get_dashboard():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.append(websocket)
    
    try:
        # Envoyer les données actuelles au nouveau client
        if crypto_data:
            message = {
                "type": "crypto_update",
                "data": crypto_data,
                "timestamp": datetime.now().isoformat()
            }
            await websocket.send_text(json.dumps(message))
        
        while True:
            # Garder la connexion ouverte
            await websocket.receive_text()
    except WebSocketDisconnect:
        connections.remove(websocket)

@app.get("/api/crypto/{crypto_id}")
async def get_crypto_data(crypto_id: str):
    """API pour récupérer les données d'une crypto spécifique"""
    if crypto_id in crypto_data:
        return crypto_data[crypto_id]
    return {"error": "Crypto not found"}

@app.get("/api/refresh")
async def refresh_prices():
    """API pour forcer un rafraîchissement des prix"""
    try:
        # Forcer une mise à jour immédiate
        await fetch_crypto_data()
        await broadcast_data()
        return {"status": "success", "message": "Prix actualisés", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/wallet/connect")
async def connect_wallet(request: WalletConnectionRequest, user_id: str = "default_user"):
    """Connecter un wallet à l'utilisateur"""
    try:
        if request.wallet_type == 'binance':
            if not request.api_key or not request.secret_key:
                raise HTTPException(status_code=400, detail="API key et secret key requis pour Binance")
            
            result = await wallet_manager.connect_binance_wallet(
                user_id, 
                request.api_key, 
                request.secret_key, 
                request.testnet or False
            )
            
        elif request.wallet_type == 'metamask':
            if not request.wallet_address or not request.infura_project_id:
                raise HTTPException(status_code=400, detail="Adresse wallet et Project ID Infura requis pour MetaMask")
            
            result = await wallet_manager.connect_metamask_wallet(
                user_id,
                request.wallet_address,
                request.infura_project_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Type de wallet non supporté: {request.wallet_type}")
            
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/wallet/list/{user_id}")
async def list_user_wallets(user_id: str):
    """Lister tous les wallets d'un utilisateur"""
    try:
        wallets = wallet_manager.get_user_wallets(user_id)
        return {
            'success': True,
            'wallets': wallets,
            'count': len(wallets)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/wallet/disconnect")
async def disconnect_wallet(request: WalletDisconnectRequest, user_id: str = "default_user"):
    """Déconnecter un wallet"""
    try:
        success = wallet_manager.disconnect_wallet(user_id, request.wallet_type)
        return {
            'success': success,
            'message': f'Wallet {request.wallet_type} déconnecté' if success else 'Wallet non trouvé'
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/wallet/transactions/{user_id}/{wallet_type}")
async def get_wallet_transactions(user_id: str, wallet_type: str, limit: int = 50):
    """Récupérer les transactions d'un wallet"""
    try:
        transactions = await wallet_manager.get_wallet_transactions(user_id, wallet_type, limit)
        return {
            'success': True,
            'transactions': transactions,
            'count': len(transactions)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/wallet/update-balances/{user_id}")
async def update_wallet_balances(user_id: str):
    """Mettre à jour les soldes de tous les wallets"""
    try:
        result = await wallet_manager.update_wallet_balances(user_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
