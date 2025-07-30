// Variables globales
let ws;
let charts = {};
let portfolio = [];
let transactions = [];
let alerts = [];
let favorites = JSON.parse(localStorage.getItem('crypto-favorites')) || [];
let connectedWallets = JSON.parse(localStorage.getItem('connected-wallets')) || [];
let userSettings = JSON.parse(localStorage.getItem('user-settings')) || {
    theme: 'dark',
    currency: 'usd',
    autoRefresh: true,
    refreshInterval: 5,
    priceAlerts: true,
    marketAlerts: true,
    newsNotifications: true,
    emailNotifications: false,
    animationsEnabled: true,
    saveLocally: true,
    defaultExchange: 'binance'
};

// État utilisateur
let currentUser = JSON.parse(localStorage.getItem('current-user')) || null;
let crypto_data = {};
let newsData = [];
let marketStats = {};

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
            duration: userSettings.animationsEnabled ? 750 : 0,
            easing: 'easeInOutQuart'
        }
    }
};

// ===== GESTION DES WEBSOCKETS =====
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
                updateMarketStats();
                checkPriceAlerts();
                updatePortfolioValue();
            }
        } catch (error) {
            console.error('Erreur parsing message:', error);
            console.error('Message reçu:', event.data);
        }
    };
}

// ===== RAFRAÎCHISSEMENT MANUEL =====
async function refreshPrices() {
    const refreshBtn = document.getElementById('refresh-prices-btn');
    if (!refreshBtn) return;

    // Animation du bouton
    refreshBtn.disabled = true;
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';

    try {
        // Demander les données actualisées au serveur
        const response = await fetch('/api/refresh');
        if (response.ok) {
            showNotification('Prix actualisés avec succès!', 'success');
            updateStatus('🟢 Connecté - Données actualisées', 'connected');
        } else {
            showNotification('Erreur lors de l\'actualisation', 'error');
        }
    } catch (error) {
        console.error('Erreur lors du rafraîchissement:', error);
        showNotification('Erreur de connexion lors de l\'actualisation', 'error');
    } finally {
        // Remettre le bouton à l'état normal
        setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.style.transform = 'rotate(0deg)';
        }, 500);
    }
}

// ===== GESTION DES DONNÉES CRYPTO =====
function updateCryptoData(data) {
    crypto_data = data;

    const viewMode = document.getElementById('view-mode').value;

    if (viewMode === 'grid') {
        updateCryptoGrid(data);
    } else if (viewMode === 'table') {
        updateCryptoTable(data);
    }

    updateSearchResults();
}

function updateCryptoGrid(data) {
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

function updateCryptoTable(data) {
    const tableBody = document.getElementById('crypto-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    Object.entries(data).forEach(([cryptoId, cryptoInfo]) => {
        const row = createTableRow(cryptoId, cryptoInfo);
        tableBody.appendChild(row);
    });
}

function createTableRow(cryptoId, cryptoInfo) {
    const row = document.createElement('tr');
    const current = cryptoInfo.current || {};
    const isFavorite = favorites.includes(cryptoId);

    row.innerHTML = `
        <td>
            <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-crypto="${cryptoId}">
                ${isFavorite ? '⭐' : '☆'}
            </button>
        </td>
        <td class="crypto-name-cell">
            <strong>${formatCryptoName(cryptoId)}</strong>
        </td>
        <td class="price-cell">$${formatPrice(current.usd || 0)}</td>
        <td class="change-cell ${(current.usd_24h_change || 0) >= 0 ? 'positive' : 'negative'}">
            ${(current.usd_24h_change || 0).toFixed(2)}%
        </td>
        <td class="change-cell">0.00%</td>
        <td>$${formatPrice(current.usd_24h_vol || 0)}</td>
        <td>$${formatPrice((cryptoInfo.stats || {}).market_cap || 0)}</td>
        <td>
            <button class="action-btn" onclick="addToPortfolio('${cryptoId}')">➕</button>
            <button class="action-btn" onclick="createAlert('${cryptoId}')">🔔</button>
        </td>
    `;

    return row;
}

// ===== PORTFOLIO =====
function updatePortfolioValue() {
    if (!portfolio.length) return;

    let totalValue = 0;
    let totalChange24h = 0;
    let totalPaid = 0;

    portfolio.forEach(holding => {
        const cryptoData = crypto_data[holding.cryptoId];
        if (cryptoData && cryptoData.current) {
            const currentPrice = cryptoData.current.usd || 0;
            const holdingValue = holding.quantity * currentPrice;
            const paidValue = holding.quantity * holding.avgPrice;

            totalValue += holdingValue;
            totalPaid += paidValue;

            const change24h = (cryptoData.current.usd_24h_change || 0) / 100;
            totalChange24h += holdingValue * change24h;
        }
    });

    const totalChange = totalValue - totalPaid;
    const totalChangePercent = totalPaid > 0 ? (totalChange / totalPaid) * 100 : 0;

    updateElement('total-portfolio-value', `$${formatPrice(totalValue)}`);
    updateElement('portfolio-24h-change', `$${formatPrice(totalChange24h)} (${(totalChange24h/totalValue*100).toFixed(2)}%)`);
    updateElement('portfolio-total-change', `$${formatPrice(totalChange)} (${totalChangePercent.toFixed(2)}%)`);
    updateElement('profile-portfolio-value', `$${formatPrice(totalValue)}`);
}

function addTransaction(transaction) {
    transactions.push({
        ...transaction,
        id: Date.now(),
        timestamp: new Date().toISOString()
    });

    updatePortfolioFromTransactions();
    saveToLocalStorage('transactions', transactions);
    updateTransactionCount();
    showNotification('Transaction ajoutée avec succès!', 'success');
}

function updatePortfolioFromTransactions() {
    const holdings = {};

    transactions.forEach(tx => {
        if (!holdings[tx.crypto]) {
            holdings[tx.crypto] = {
                cryptoId: tx.crypto,
                quantity: 0,
                totalPaid: 0,
                avgPrice: 0
            };
        }

        if (tx.type === 'buy') {
            holdings[tx.crypto].quantity += tx.quantity;
            holdings[tx.crypto].totalPaid += tx.quantity * tx.price + tx.fees;
        } else if (tx.type === 'sell') {
            holdings[tx.crypto].quantity -= tx.quantity;
            holdings[tx.crypto].totalPaid -= tx.quantity * holdings[tx.crypto].avgPrice;
        }

        if (holdings[tx.crypto].quantity > 0) {
            holdings[tx.crypto].avgPrice = holdings[tx.crypto].totalPaid / holdings[tx.crypto].quantity;
        }
    });

    portfolio = Object.values(holdings).filter(h => h.quantity > 0);
    saveToLocalStorage('portfolio', portfolio);
}

// ===== ALERTES =====
function createAlert(cryptoId, targetPrice, condition = 'above') {
    const alert = {
        id: Date.now(),
        cryptoId,
        targetPrice,
        condition,
        active: true,
        createdAt: new Date().toISOString()
    };

    alerts.push(alert);
    saveToLocalStorage('alerts', alerts);
    showNotification('Alerte créée avec succès!', 'success');
    updateAlertsDisplay();
}

function checkPriceAlerts() {
    alerts.filter(alert => alert.active).forEach(alert => {
        const cryptoData = crypto_data[alert.cryptoId];
        if (!cryptoData || !cryptoData.current) return;

        const currentPrice = cryptoData.current.usd;
        let triggered = false;

        if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
            triggered = true;
        } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
            triggered = true;
        }

        if (triggered) {
            showNotification(
                `🔔 Alerte: ${formatCryptoName(alert.cryptoId)} a ${alert.condition === 'above' ? 'dépassé' : 'chuté sous'} $${alert.targetPrice}!`,
                'warning'
            );
            alert.active = false;
            saveToLocalStorage('alerts', alerts);
        }
    });
}

// ===== ACTUALITÉS =====
async function fetchNews() {
    try {
        // Simulation d'actualités crypto
        const sampleNews = [
            {
                title: "Bitcoin atteint un nouveau sommet historique",
                description: "Le Bitcoin franchit la barre des $100,000 pour la première fois...",
                url: "#",
                publishedAt: new Date().toISOString(),
                source: "CryptoCoin"
            },
            {
                title: "Ethereum 2.0: Les mises à jour arrivent",
                description: "Les développeurs d'Ethereum annoncent de nouvelles améliorations...",
                url: "#",
                publishedAt: new Date(Date.now() - 3600000).toISOString(),
                source: "ETH News"
            },
            {
                title: "Régulation crypto: Nouvelles règles en Europe",
                description: "L'Union Européenne vote de nouvelles règles pour les cryptomonnaies...",
                url: "#",
                publishedAt: new Date(Date.now() - 7200000).toISOString(),
                source: "Regulatory Watch"
            }
        ];

        newsData = sampleNews;
        updateNewsDisplay();
    } catch (error) {
        console.error('Erreur lors de la récupération des actualités:', error);
    }
}

function updateNewsDisplay() {
    const newsList = document.getElementById('news-list');
    if (!newsList) return;

    newsList.innerHTML = newsData.map(article => `
        <div class="news-item">
            <div class="news-header">
                <h4>${article.title}</h4>
                <span class="news-time">${formatTimeAgo(article.publishedAt)}</span>
            </div>
            <p>${article.description}</p>
            <div class="news-footer">
                <span class="news-source">${article.source}</span>
                <a href="${article.url}" target="_blank" class="news-link">Lire plus →</a>
            </div>
        </div>
    `).join('');
}

// ===== OUTILS DE CALCUL =====
function calculatePnL() {
    const buyPrice = parseFloat(document.getElementById('buy-price').value);
    const sellPrice = parseFloat(document.getElementById('sell-price').value);
    const quantity = parseFloat(document.getElementById('quantity').value);

    if (!buyPrice || !sellPrice || !quantity) {
        document.getElementById('pnl-result').innerHTML = 'Veuillez remplir tous les champs';
        return;
    }

    const buyValue = buyPrice * quantity;
    const sellValue = sellPrice * quantity;
    const pnl = sellValue - buyValue;
    const pnlPercent = (pnl / buyValue) * 100;

    const resultClass = pnl >= 0 ? 'positive' : 'negative';
    document.getElementById('pnl-result').innerHTML = `
        <div class="pnl-breakdown">
            <div>Valeur d'achat: $${buyValue.toFixed(2)}</div>
            <div>Valeur de vente: $${sellValue.toFixed(2)}</div>
            <div class="${resultClass}">
                P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)
            </div>
        </div>
    `;
}

function convertCurrency() {
    const amount = parseFloat(document.getElementById('convert-amount').value);
    const from = document.getElementById('convert-from').value;
    const to = document.getElementById('convert-to').value;

    if (!amount || !from || !to) return;

    // Simulation de conversion (normalement via API)
    const rates = {
        'btc': crypto_data.bitcoin?.current?.usd || 50000,
        'eth': crypto_data.ethereum?.current?.usd || 3000,
        'usd': 1,
        'eur': 0.85
    };

    const fromRate = rates[from] || 1;
    const toRate = rates[to] || 1;
    const result = (amount * fromRate) / toRate;

    document.getElementById('conversion-result').textContent = 
        `${result.toFixed(8)} ${to.toUpperCase()}`;
}

// ===== GESTION DES FAVORIS =====
function toggleFavorite(cryptoId) {
    const index = favorites.indexOf(cryptoId);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(cryptoId);
    }

    saveToLocalStorage('crypto-favorites', favorites);
    updateFavoriteButtons();
    showNotification(
        index > -1 ? 'Retiré des favoris' : 'Ajouté aux favoris',
        'info'
    );
}

function updateFavoriteButtons() {
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        const cryptoId = btn.dataset.crypto;
        const isFavorite = favorites.includes(cryptoId);
        btn.textContent = isFavorite ? '⭐' : '☆';
        btn.classList.toggle('active', isFavorite);
    });
}

// ===== MENU HAMBURGER =====
function setupHamburgerMenu() {
    const menuToggle = document.getElementById('menu-toggle');
    const dropdownMenu = document.getElementById('dropdown-menu');

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        menuToggle.classList.toggle('active');
        dropdownMenu.classList.toggle('active');
    });

    // Fermer le menu en cliquant ailleurs
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.menu-container')) {
            menuToggle.classList.remove('active');
            dropdownMenu.classList.remove('active');
        }
    });

    // Fermer le menu après clic sur un élément
    dropdownMenu.addEventListener('click', (e) => {
        if (e.target.classList.contains('dropdown-item') && !e.target.matches('select')) {
            setTimeout(() => {
                menuToggle.classList.remove('active');
                dropdownMenu.classList.remove('active');
            }, 150);
        }
    });
}

// ===== RECHERCHE =====
function setupSearch() {
    const searchInput = document.getElementById('crypto-search');
    const searchResults = document.getElementById('search-results');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        const matches = Object.keys(crypto_data).filter(cryptoId => 
            formatCryptoName(cryptoId).toLowerCase().includes(query) ||
            cryptoId.toLowerCase().includes(query)
        ).slice(0, 5);

        if (matches.length > 0) {
            searchResults.innerHTML = matches.map(cryptoId => `
                <div class="search-result-item" data-crypto="${cryptoId}">
                    ${formatCryptoName(cryptoId)}
                </div>
            `).join('');
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    });

    searchResults.addEventListener('click', (e) => {
        if (e.target.classList.contains('search-result-item')) {
            const cryptoId = e.target.dataset.crypto;
            const card = document.getElementById(`card-${cryptoId}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth' });
                card.classList.add('highlight');
                setTimeout(() => card.classList.remove('highlight'), 2000);
            }
            searchResults.style.display = 'none';
            searchInput.value = '';
        }
    });
}

// ===== STATISTIQUES DU MARCHÉ =====
function updateMarketStats() {
    // Calcul des statistiques globales
    let totalMarketCap = 0;
    let totalVolume = 0;
    let btcDominance = 0;

    Object.values(crypto_data).forEach(crypto => {
        if (crypto.stats && crypto.current) {
            totalMarketCap += crypto.stats.market_cap || 0;
            totalVolume += crypto.current.usd_24h_vol || 0;
        }
    });

    if (crypto_data.bitcoin && crypto_data.bitcoin.stats) {
        btcDominance = ((crypto_data.bitcoin.stats.market_cap || 0) / totalMarketCap) * 100;
    }

    updateElement('total-market-cap', `$${formatPrice(totalMarketCap)}`);
    updateElement('total-volume', `$${formatPrice(totalVolume)}`);
    updateElement('btc-dominance', `${btcDominance.toFixed(1)}%`);

    // Fear & Greed Index (simulation)
    const fearGreedValue = Math.floor(Math.random() * 100);
    updateElement('fear-greed', fearGreedValue);
    updateFearGreedIndicator(fearGreedValue);
}

function updateFearGreedIndicator(value) {
    const indicator = document.getElementById('fear-greed-indicator');
    if (!indicator) return;

    let color, text;
    if (value <= 25) {
        color = '#f44336';
        text = 'Peur Extrême';
    } else if (value <= 45) {
        color = '#ff9800';
        text = 'Peur';
    } else if (value <= 55) {
        color = '#ffeb3b';
        text = 'Neutre';
    } else if (value <= 75) {
        color = '#8bc34a';
        text = 'Cupidité';
    } else {
        color = '#4caf50';
        text = 'Cupidité Extrême';
    }

    indicator.style.background = color;
    indicator.textContent = text;
}

// ===== GESTION DES VUES =====
function switchView(mode) {
    const grid = document.getElementById('crypto-grid');
    const table = document.getElementById('crypto-table');

    if (mode === 'table') {
        grid.style.display = 'none';
        table.style.display = 'block';
        updateCryptoTable(crypto_data);
    } else {
        grid.style.display = 'grid';
        table.style.display = 'none';
    }
}

// ===== GESTION DES PARAMÈTRES =====
function switchSettingsTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

function saveSettings() {
    userSettings.theme = document.getElementById('theme-select').value;
    userSettings.currency = document.getElementById('currency-select').value;
    userSettings.autoRefresh = document.getElementById('auto-refresh').checked;
    userSettings.refreshInterval = parseInt(document.getElementById('refresh-interval').value);
    userSettings.priceAlerts = document.getElementById('price-alerts').checked;
    userSettings.marketAlerts = document.getElementById('market-alerts').checked;
    userSettings.newsNotifications = document.getElementById('news-notifications').checked;
    userSettings.emailNotifications = document.getElementById('email-notifications').checked;
    userSettings.animationsEnabled = document.getElementById('animations-enabled').checked;
    userSettings.saveLocally = document.getElementById('save-locally').checked;
    userSettings.defaultExchange = document.getElementById('default-exchange').value;

    saveToLocalStorage('user-settings', userSettings);
    applyTheme(userSettings.theme);

    closeModal('settings-modal');
    showNotification('Paramètres sauvegardés !', 'success');
}

// ===== UTILITAIRES =====
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

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'À l\'instant';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}j`;
}

function saveToLocalStorage(key, data) {
    if (userSettings.saveLocally) {
        localStorage.setItem(key, JSON.stringify(data));
    }
}

function updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) element.textContent = content;
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications-container');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    notification.innerHTML = `
        <span class="notification-icon">${icons[type] || icons.info}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close">&times;</button>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 5000);

    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
}

function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function applyTheme(theme) {
    document.body.className = theme === 'light' ? 'light-theme' : 'dark-theme';
}

function updateStatus(text, className) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = text;
        statusElement.className = `status ${className}`;
    }
}

function updateTransactionCount() {
    updateElement('profile-transactions', transactions.length);
}

// Reprendre les fonctions existantes pour les cartes crypto
function createCryptoCard(cryptoId, cryptoInfo) {
    const card = document.createElement('div');
    card.className = 'crypto-card';
    card.id = `card-${cryptoId}`;

    const isFavorite = favorites.includes(cryptoId);

    card.innerHTML = `
        <div class="crypto-header">
            <div class="crypto-name" id="name-${cryptoId}">${formatCryptoName(cryptoId)}</div>
            <div class="crypto-actions">
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-crypto="${cryptoId}">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
                <div class="change" id="change-${cryptoId}">0.00%</div>
            </div>
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
        <div class="card-actions">
            <button class="action-btn" onclick="addToPortfolio('${cryptoId}')">➕ Portfolio</button>
            <button class="action-btn" onclick="openAlertModal('${cryptoId}')">🔔 Alerte</button>
        </div>
    `;

    // Ajouter les événements
    setTimeout(() => {
        const ctx = document.getElementById(`chart-${cryptoId}`);
        if (ctx) {
            charts[cryptoId] = {
                chart: new Chart(ctx.getContext('2d'), {
                    ...chartConfig,
                    data: JSON.parse(JSON.stringify(chartConfig.data))
                }),
                currentPeriod: 'realtime'
            };
        }

        // Gestionnaires d'événements
        const tabBtns = card.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const period = btn.dataset.period;
                const crypto = btn.dataset.crypto;
                switchChartPeriod(crypto, period);

                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        const favoriteBtn = card.querySelector('.favorite-btn');
        favoriteBtn.addEventListener('click', () => {
            toggleFavorite(cryptoId);
        });
    }, 100);

    return card;
}

function updateCryptoCard(cryptoId, cryptoInfo) {
    const current = cryptoInfo.current;
    const stats = cryptoInfo.stats || {};
    if (!current) return;

    updateElement(`price-${cryptoId}`, `$${formatPrice(current.usd)}`);

    const change24h = current.usd_24h_change || 0;
    const changeElement = document.getElementById(`change-${cryptoId}`);
    if (changeElement) {
        changeElement.textContent = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
        changeElement.className = `change ${change24h >= 0 ? 'positive' : 'negative'}`;
    }

    updateStatElement(`change-24h-${cryptoId}`, change24h, true);
    updateStatElement(`change-year-${cryptoId}`, stats.year_change, true);
    updateStatElement(`year-high-${cryptoId}`, stats.year_high, false, true);
    updateStatElement(`year-low-${cryptoId}`, stats.year_low, false, true);
    updateStatElement(`volume-${cryptoId}`, current.usd_24h_vol, false, true);
    updateStatElement(`market-cap-${cryptoId}`, stats.market_cap, false, true);

    updateChart(cryptoId, cryptoInfo);
}

function updateStatElement