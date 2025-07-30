
import asyncio
import json
from datetime import datetime
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
CRYPTOS = ["bitcoin", "ethereum", "binancecoin", "cardano", "solana", "dogecoin", "polygon"]

async def fetch_crypto_data():
    """Récupère les données des cryptos depuis l'API CoinGecko"""
    async with aiohttp.ClientSession() as session:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(CRYPTOS)}&vs_currencies=usd,eur&include_24hr_change=true&include_24hr_vol=true"
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
                                "current": {}
                            }
                        
                        # Ajouter le prix actuel à l'historique
                        crypto_data[crypto_id]["prices"].append(crypto_info.get("usd", 0))
                        crypto_data[crypto_id]["timestamps"].append(timestamp)
                        crypto_data[crypto_id]["current"] = crypto_info
                        
                        # Garder seulement les 100 derniers points
                        if len(crypto_data[crypto_id]["prices"]) > 100:
                            crypto_data[crypto_id]["prices"] = crypto_data[crypto_id]["prices"][-100:]
                            crypto_data[crypto_id]["timestamps"] = crypto_data[crypto_id]["timestamps"][-100:]
                    
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
    while True:
        await fetch_crypto_data()
        await broadcast_data()
        await asyncio.sleep(30)  # Mise à jour toutes les 30 secondes

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
