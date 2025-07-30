
// Variables globales
let ws;
let charts = {};

// Configuration des graphiques
const chartConfig = {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Prix USD',
            data: [],
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            borderWidth: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(45, 45, 45, 0.9)',
                titleColor: '#fff',
                bodyColor: '#fff',
                borderColor: '#4CAF50',
                borderWidth: 1,
                cornerRadius: 8,
                displayColors: false
            }
        },
        scales: {
            x: {
                display: false,
                grid: {
                    display: false
                }
            },
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)',
                    lineWidth: 1
                },
                ticks: {
                    color: '#fff',
                    font: {
                        size: 12
                    },
                    callback: function(value) {
                        return '$' + value.toLocaleString();
                    }
                }
            }
        },
        animation: {
            duration: 750,
            easing: 'easeInOutQuart'
        }
    }
};

// Fonction de connexion WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    
    ws.onopen = function() {
        updateStatus('🟢 Connecté - Données en temps réel', 'connected');
        console.log('WebSocket connecté');
    };
    
    ws.onclose = function() {
        updateStatus('🔴 Déconnecté - Tentative de reconnexion...', 'disconnected');
        console.log('WebSocket déconnecté, tentative de reconnexion...');
        setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = function(error) {
        console.error('Erreur WebSocket:', error);
        updateStatus('❌ Erreur de connexion', 'disconnected');
    };
    
    ws.onmessage = function(event) {
        try {
            const message = JSON.parse(event.data);
            if (message.type === 'crypto_update') {
                updateCryptoData(message.data);
            }
        } catch (error) {
            console.error('Erreur parsing message:', error);
        }
    };
}

// Mettre à jour le statut de connexion
function updateStatus(text, className) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `status ${className}`;
    }
}

// Mettre à jour les données crypto
function updateCryptoData(data) {
    const grid = document.getElementById('crypto-grid');
    if (!grid) return;
    
    for (const [cryptoId, cryptoInfo] of Object.entries(data)) {
        let card = document.getElementById(`card-${cryptoId}`);
        
        if (!card) {
            card = createCryptoCard(cryptoId, cryptoInfo);
            grid.appendChild(card);
        }
        
        updateCryptoCard(cryptoId, cryptoInfo);
    }
}

// Créer une carte crypto
function createCryptoCard(cryptoId, cryptoInfo) {
    const card = document.createElement('div');
    card.className = 'crypto-card';
    card.id = `card-${cryptoId}`;
    
    card.innerHTML = `
        <div class="crypto-header">
            <div class="crypto-name" id="name-${cryptoId}">${formatCryptoName(cryptoId)}</div>
            <div class="change" id="change-${cryptoId}">0.00%</div>
        </div>
        <div class="price" id="price-${cryptoId}">$0.00</div>
        <div class="crypto-info">
            <div class="volume" id="volume-${cryptoId}">Volume 24h: $0</div>
        </div>
        <div class="chart-container">
            <canvas id="chart-${cryptoId}"></canvas>
        </div>
    `;
    
    // Créer le graphique après un court délai pour s'assurer que l'élément est dans le DOM
    setTimeout(() => {
        const ctx = document.getElementById(`chart-${cryptoId}`);
        if (ctx) {
            charts[cryptoId] = new Chart(ctx.getContext('2d'), {
                ...chartConfig,
                data: JSON.parse(JSON.stringify(chartConfig.data)) // Clone profond
            });
        }
    }, 100);
    
    return card;
}

// Formater le nom de la crypto
function formatCryptoName(cryptoId) {
    const names = {
        'bitcoin': 'Bitcoin (BTC)',
        'ethereum': 'Ethereum (ETH)',
        'binancecoin': 'Binance Coin (BNB)',
        'cardano': 'Cardano (ADA)',
        'solana': 'Solana (SOL)',
        'dogecoin': 'Dogecoin (DOGE)',
        'polygon': 'Polygon (MATIC)'
    };
    return names[cryptoId] || cryptoId.charAt(0).toUpperCase() + cryptoId.slice(1);
}

// Mettre à jour une carte crypto
function updateCryptoCard(cryptoId, cryptoInfo) {
    const current = cryptoInfo.current;
    if (!current) return;
    
    // Mettre à jour le prix
    const priceElement = document.getElementById(`price-${cryptoId}`);
    if (priceElement && current.usd !== undefined) {
        priceElement.textContent = `$${formatPrice(current.usd)}`;
    }
    
    // Mettre à jour le changement 24h
    const change24h = current.usd_24h_change || 0;
    const changeElement = document.getElementById(`change-${cryptoId}`);
    if (changeElement) {
        changeElement.textContent = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
        changeElement.className = `change ${change24h >= 0 ? 'positive' : 'negative'}`;
    }
    
    // Mettre à jour le volume (si l'élément existe)
    const volumeElement = document.getElementById(`volume-${cryptoId}`);
    if (volumeElement && current.usd_24h_vol) {
        volumeElement.textContent = `Volume 24h: $${formatPrice(current.usd_24h_vol)}`;
    }
    
    // Mettre à jour le graphique
    updateChart(cryptoId, cryptoInfo);
}

// Formater le prix
function formatPrice(price) {
    if (price >= 1000000) {
        return (price / 1000000).toFixed(2) + 'M';
    } else if (price >= 1000) {
        return (price / 1000).toFixed(2) + 'K';
    } else if (price >= 1) {
        return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
        return price.toFixed(6);
    }
}

// Mettre à jour le graphique
function updateChart(cryptoId, cryptoInfo) {
    const chart = charts[cryptoId];
    if (!chart) return;
    
    const prices = cryptoInfo.prices || [];
    const timestamps = cryptoInfo.timestamps || [];
    
    if (prices.length === 0) return;
    
    // Limiter le nombre de points affichés pour des performances optimales
    const maxPoints = 50;
    const step = Math.max(1, Math.floor(prices.length / maxPoints));
    
    const filteredPrices = prices.filter((_, index) => index % step === 0);
    const filteredTimestamps = timestamps.filter((_, index) => index % step === 0);
    
    chart.data.labels = filteredTimestamps.map(ts => new Date(ts).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
    }));
    chart.data.datasets[0].data = filteredPrices;
    
    // Mettre à jour la couleur en fonction de la tendance
    const isUpTrend = filteredPrices.length > 1 && 
                      filteredPrices[filteredPrices.length - 1] > filteredPrices[0];
    
    chart.data.datasets[0].borderColor = isUpTrend ? '#4CAF50' : '#f44336';
    chart.data.datasets[0].backgroundColor = isUpTrend ? 
        'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)';
    
    chart.update('none');
}

// Gestion des erreurs globales
window.addEventListener('error', function(event) {
    console.error('Erreur JavaScript:', event.error);
});

// Initialisation
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard crypto initialisé');
    connectWebSocket();
});

// Gestion de la visibilité de la page pour économiser les ressources
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && ws.readyState !== WebSocket.OPEN) {
        connectWebSocket();
    }
});
