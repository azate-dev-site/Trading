
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
    
    // Mettre à jour les données globales
    crypto_data = data;
    
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
        <div class="crypto-stats">
            <div class="stat-row">
                <span class="stat-label">24h:</span>
                <span class="stat-value" id="change-24h-${cryptoId}">0.00%</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">1 an:</span>
                <span class="stat-value" id="change-year-${cryptoId}">0.00%</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Plus haut:</span>
                <span class="stat-value" id="year-high-${cryptoId}">$0.00</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Plus bas:</span>
                <span class="stat-value" id="year-low-${cryptoId}">$0.00</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Volume 24h:</span>
                <span class="stat-value" id="volume-${cryptoId}">$0</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Market Cap:</span>
                <span class="stat-value" id="market-cap-${cryptoId}">$0</span>
            </div>
        </div>
        <div class="chart-tabs">
            <button class="tab-btn active" data-period="realtime" data-crypto="${cryptoId}">Temps réel</button>
            <button class="tab-btn" data-period="historical" data-crypto="${cryptoId}">1 Année</button>
        </div>
        <div class="chart-container">
            <canvas id="chart-${cryptoId}"></canvas>
        </div>
    `;
    
    // Créer le graphique après un court délai pour s'assurer que l'élément est dans le DOM
    setTimeout(() => {
        const ctx = document.getElementById(`chart-${cryptoId}`);
        if (ctx) {
            charts[cryptoId] = {
                chart: new Chart(ctx.getContext('2d'), {
                    ...chartConfig,
                    data: JSON.parse(JSON.stringify(chartConfig.data)) // Clone profond
                }),
                currentPeriod: 'realtime'
            };
        }
        
        // Ajouter les gestionnaires d'événements pour les onglets
        const tabBtns = card.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                const crypto = btn.dataset.crypto;
                switchChartPeriod(crypto, period);
                
                // Mettre à jour l'apparence des onglets
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
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
        'polygon': 'Polygon (MATIC)',
        'chainlink': 'Chainlink (LINK)',
        'litecoin': 'Litecoin (LTC)',
        'avalanche-2': 'Avalanche (AVAX)',
        'uniswap': 'Uniswap (UNI)',
        'polkadot': 'Polkadot (DOT)',
        'near': 'NEAR Protocol (NEAR)',
        'cosmos': 'Cosmos (ATOM)',
        'algorand': 'Algorand (ALGO)',
        'tron': 'TRON (TRX)',
        'stellar': 'Stellar (XLM)',
        'filecoin': 'Filecoin (FIL)',
        'vechain': 'VeChain (VET)',
        'hedera-hashgraph': 'Hedera (HBAR)',
        'internet-computer': 'Internet Computer (ICP)',
        'the-sandbox': 'The Sandbox (SAND)'
    };
    return names[cryptoId] || cryptoId.charAt(0).toUpperCase() + cryptoId.slice(1);
}

// Mettre à jour une carte crypto
function updateCryptoCard(cryptoId, cryptoInfo) {
    const current = cryptoInfo.current;
    const stats = cryptoInfo.stats || {};
    if (!current) return;
    
    // Mettre à jour le prix
    const priceElement = document.getElementById(`price-${cryptoId}`);
    if (priceElement && current.usd !== undefined) {
        priceElement.textContent = `$${formatPrice(current.usd)}`;
    }
    
    // Mettre à jour le changement 24h dans l'en-tête
    const change24h = current.usd_24h_change || 0;
    const changeElement = document.getElementById(`change-${cryptoId}`);
    if (changeElement) {
        changeElement.textContent = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
        changeElement.className = `change ${change24h >= 0 ? 'positive' : 'negative'}`;
    }
    
    // Mettre à jour les statistiques détaillées
    updateStatElement(`change-24h-${cryptoId}`, change24h, true);
    updateStatElement(`change-year-${cryptoId}`, stats.year_change, true);
    updateStatElement(`year-high-${cryptoId}`, stats.year_high, false, true);
    updateStatElement(`year-low-${cryptoId}`, stats.year_low, false, true);
    updateStatElement(`volume-${cryptoId}`, current.usd_24h_vol, false, true);
    updateStatElement(`market-cap-${cryptoId}`, stats.market_cap, false, true);
    
    // Mettre à jour le graphique
    updateChart(cryptoId, cryptoInfo);
}

// Fonction helper pour mettre à jour un élément de statistique
function updateStatElement(elementId, value, isPercentage = false, isPrice = false) {
    const element = document.getElementById(elementId);
    if (!element || value === undefined || value === null) return;
    
    if (isPercentage) {
        element.textContent = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
        element.className = `stat-value ${value >= 0 ? 'positive' : 'negative'}`;
    } else if (isPrice) {
        element.textContent = `$${formatPrice(value)}`;
    } else {
        element.textContent = value.toString();
    }
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

// Changer la période du graphique
function switchChartPeriod(cryptoId, period) {
    const chartObj = charts[cryptoId];
    if (!chartObj) return;
    
    chartObj.currentPeriod = period;
    updateChart(cryptoId, crypto_data[cryptoId] || {});
}

// Mettre à jour le graphique
function updateChart(cryptoId, cryptoInfo) {
    const chartObj = charts[cryptoId];
    if (!chartObj) return;
    
    const chart = chartObj.chart;
    const period = chartObj.currentPeriod || 'realtime';
    
    let prices, timestamps;
    
    if (period === 'historical') {
        prices = cryptoInfo.historical_prices || [];
        timestamps = cryptoInfo.historical_timestamps || [];
    } else {
        prices = cryptoInfo.prices || [];
        timestamps = cryptoInfo.timestamps || [];
    }
    
    if (prices.length === 0) return;
    
    // Limiter le nombre de points affichés selon la période
    const maxPoints = period === 'historical' ? 100 : 50;
    const step = Math.max(1, Math.floor(prices.length / maxPoints));
    
    const filteredPrices = prices.filter((_, index) => index % step === 0);
    const filteredTimestamps = timestamps.filter((_, index) => index % step === 0);
    
    // Formater les labels selon la période
    chart.data.labels = filteredTimestamps.map(ts => {
        const date = new Date(ts);
        if (period === 'historical') {
            return date.toLocaleDateString('fr-FR', {
                month: 'short',
                day: 'numeric'
            });
        } else {
            return date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    });
    
    chart.data.datasets[0].data = filteredPrices;
    
    // Mettre à jour la couleur en fonction de la tendance
    const isUpTrend = filteredPrices.length > 1 && 
                      filteredPrices[filteredPrices.length - 1] > filteredPrices[0];
    
    chart.data.datasets[0].borderColor = isUpTrend ? '#4CAF50' : '#f44336';
    chart.data.datasets[0].backgroundColor = isUpTrend ? 
        'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)';
    
    chart.update('none');
}

// Variable globale pour stocker les données
let crypto_data = {};

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
