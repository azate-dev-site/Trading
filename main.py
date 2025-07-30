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

                        crypto_data[crypto_id]["current"] = crypto_info

                        # Ajouter le prix et le timestamp aux historiques temps réel
                        current_price = float(crypto_info.get("usd", 0))
                        crypto_data[crypto_id]["prices"].append(current_price)
                        crypto_data[crypto_id]["timestamps"].append(datetime.now().isoformat())

                        # Calculer les statistiques annuelles
                        historical_prices = crypto_data[crypto_id].get("historical_prices", [])

                        if historical_prices and len(historical_prices) > 0:
                            year_ago_price = float(historical_prices[0])
                            year_change = ((current_price - year_ago_price) / year_ago_price * 100) if year_ago_price > 0 else 0.0
                            max_year = float(max(historical_prices))
                            min_year = float(min(historical_prices))

                            crypto_data[crypto_id]["stats"] = {
                                "year_change": round(year_change, 2),
                                "year_high": round(max_year, 6),
                                "year_low": round(min_year, 6),
                                "market_cap": float(crypto_info.get("usd_market_cap", 0))
                            }
                        else:
                            crypto_data[crypto_id]["stats"] = {
                                "year_change": 0.0,
                                "year_high": current_price,
                                "year_low": current_price,
                                "market_cap": float(crypto_info.get("usd_market_cap", 0))
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
        # Créer une version sécurisée des données pour l'envoi
        safe_data = {}
        for crypto_id, crypto_info in crypto_data.items():
            safe_data[crypto_id] = {
                "current": crypto_info.get("current", {}),
                "stats": crypto_info.get("stats", {}),
                "prices": crypto_info.get("prices", [])[-50:],  # Limiter à 50 points
                "timestamps": crypto_info.get("timestamps", [])[-50:],
                "historical_prices": crypto_info.get("historical_prices", []),
                "historical_timestamps": crypto_info.get("historical_timestamps", [])
            }

        message = {
            "type": "crypto_update",
            "data": safe_data,
            "timestamp": datetime.now().isoformat()
        }

        # S'assurer que le message est sérialisable en JSON
        try:
            json_message = json.dumps(message, default=str, ensure_ascii=False)
        except Exception as e:
            print(f"Erreur lors de la sérialisation JSON: {e}")
            print(f"Type de données problématique: {type(crypto_data)}")
            return

        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(json_message)
            except Exception as e:
                print(f"Erreur lors de l'envoi WebSocket: {e}")
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
            # Créer une version sécurisée des données pour l'envoi
            safe_data = {}
            for crypto_id, crypto_info in crypto_data.items():
                safe_data[crypto_id] = {
                    "current": crypto_info.get("current", {}),
                    "stats": crypto_info.get("stats", {}),
                    "prices": crypto_info.get("prices", [])[-50:],  # Limiter à 50 points
                    "timestamps": crypto_info.get("timestamps", [])[-50:],
                    "historical_prices": crypto_info.get("historical_prices", []),
                    "historical_timestamps": crypto_info.get("historical_timestamps", [])
                }

            message = {
                "type": "crypto_update",
                "data": safe_data,
                "timestamp": datetime.now().isoformat()
            }
            await websocket.send_text(json.dumps(message, default=str, ensure_ascii=False))

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5000)