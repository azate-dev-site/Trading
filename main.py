
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
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Crypto Trading Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 20px;
                background-color: #1a1a1a;
                color: #ffffff;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .crypto-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
                gap: 20px;
            }
            .crypto-card {
                background: #2d2d2d;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            }
            .crypto-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            .crypto-name {
                font-size: 1.5em;
                font-weight: bold;
                text-transform: capitalize;
            }
            .price {
                font-size: 1.8em;
                font-weight: bold;
                color: #4CAF50;
            }
            .change {
                font-size: 1.1em;
                padding: 5px 10px;
                border-radius: 5px;
            }
            .positive {
                background-color: #4CAF50;
                color: white;
            }
            .negative {
                background-color: #f44336;
                color: white;
            }
            .chart-container {
                position: relative;
                height: 200px;
                margin-top: 15px;
            }
            .status {
                text-align: center;
                padding: 10px;
                background-color: #333;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .connected {
                color: #4CAF50;
            }
            .disconnected {
                color: #f44336;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚀 Crypto Trading Dashboard</h1>
            <div id="status" class="status disconnected">Connexion en cours...</div>
        </div>
        
        <div id="crypto-grid" class="crypto-grid">
            <!-- Les cartes crypto seront générées dynamiquement -->
        </div>

        <script>
            let ws;
            let charts = {};
            
            function connectWebSocket() {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
                
                ws.onopen = function() {
                    document.getElementById('status').textContent = '🟢 Connecté - Données en temps réel';
                    document.getElementById('status').className = 'status connected';
                };
                
                ws.onclose = function() {
                    document.getElementById('status').textContent = '🔴 Déconnecté - Tentative de reconnexion...';
                    document.getElementById('status').className = 'status disconnected';
                    setTimeout(connectWebSocket, 3000);
                };
                
                ws.onmessage = function(event) {
                    const message = JSON.parse(event.data);
                    if (message.type === 'crypto_update') {
                        updateCryptoData(message.data);
                    }
                };
            }
            
            function updateCryptoData(data) {
                const grid = document.getElementById('crypto-grid');
                
                for (const [cryptoId, cryptoInfo] of Object.entries(data)) {
                    let card = document.getElementById(`card-${cryptoId}`);
                    
                    if (!card) {
                        card = createCryptoCard(cryptoId, cryptoInfo);
                        grid.appendChild(card);
                    }
                    
                    updateCryptoCard(cryptoId, cryptoInfo);
                }
            }
            
            function createCryptoCard(cryptoId, cryptoInfo) {
                const card = document.createElement('div');
                card.className = 'crypto-card';
                card.id = `card-${cryptoId}`;
                
                card.innerHTML = `
                    <div class="crypto-header">
                        <div class="crypto-name" id="name-${cryptoId}">${cryptoId}</div>
                        <div class="change" id="change-${cryptoId}">0.00%</div>
                    </div>
                    <div class="price" id="price-${cryptoId}">$0.00</div>
                    <div class="chart-container">
                        <canvas id="chart-${cryptoId}"></canvas>
                    </div>
                `;
                
                // Créer le graphique
                setTimeout(() => {
                    const ctx = document.getElementById(`chart-${cryptoId}`).getContext('2d');
                    charts[cryptoId] = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: [],
                            datasets: [{
                                label: 'Prix USD',
                                data: [],
                                borderColor: '#4CAF50',
                                backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                tension: 0.4,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                }
                            },
                            scales: {
                                x: {
                                    display: false
                                },
                                y: {
                                    grid: {
                                        color: '#444'
                                    },
                                    ticks: {
                                        color: '#fff'
                                    }
                                }
                            }
                        }
                    });
                }, 100);
                
                return card;
            }
            
            function updateCryptoCard(cryptoId, cryptoInfo) {
                const current = cryptoInfo.current;
                
                // Mettre à jour le prix
                document.getElementById(`price-${cryptoId}`).textContent = 
                    `$${current.usd?.toLocaleString() || '0.00'}`;
                
                // Mettre à jour le changement 24h
                const change24h = current.usd_24h_change || 0;
                const changeElement = document.getElementById(`change-${cryptoId}`);
                changeElement.textContent = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
                changeElement.className = `change ${change24h >= 0 ? 'positive' : 'negative'}`;
                
                // Mettre à jour le graphique
                if (charts[cryptoId]) {
                    const chart = charts[cryptoId];
                    const prices = cryptoInfo.prices || [];
                    const timestamps = cryptoInfo.timestamps || [];
                    
                    chart.data.labels = timestamps.map(ts => new Date(ts).toLocaleTimeString());
                    chart.data.datasets[0].data = prices;
                    chart.update('none');
                }
            }
            
            connectWebSocket();
        </script>
    </body>
    </html>
    """

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
