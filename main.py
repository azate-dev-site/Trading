
import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List
import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="Crypto Trading Dashboard")

# Monter les fichiers statiques
app.mount("/static", StaticFiles(directory="static"), name="static")

# Store pour les connexions WebSocket
connections: List[WebSocket] = []

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)
