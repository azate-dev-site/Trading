
"""
Configuration des APIs de wallets
Les clés API doivent être stockées dans les secrets Replit
"""

WALLET_APIS = {
    'binance': {
        'name': 'Binance',
        'api_url': 'https://api.binance.com',
        'testnet_url': 'https://testnet.binance.vision',
        'required_keys': ['api_key', 'secret_key'],
        'endpoints': {
            'account': '/api/v3/account',
            'trades': '/api/v3/myTrades',
            'orders': '/api/v3/allOrders',
            'balance': '/api/v3/account'
        }
    },
    'coinbase': {
        'name': 'Coinbase Pro',
        'api_url': 'https://api.pro.coinbase.com',
        'sandbox_url': 'https://api-public.sandbox.pro.coinbase.com',
        'required_keys': ['api_key', 'secret_key', 'passphrase'],
        'endpoints': {
            'accounts': '/accounts',
            'orders': '/orders',
            'fills': '/fills',
            'products': '/products'
        }
    },
    'metamask': {
        'name': 'MetaMask (via Web3)',
        'api_url': 'https://mainnet.infura.io/v3/',
        'required_keys': ['infura_project_id'],
        'endpoints': {
            'balance': 'eth_getBalance',
            'transactions': 'eth_getTransactionByHash'
        }
    },
    'trust_wallet': {
        'name': 'Trust Wallet (via Web3)',
        'api_url': 'https://mainnet.infura.io/v3/',
        'required_keys': ['infura_project_id'],
        'endpoints': {
            'balance': 'eth_getBalance',
            'transactions': 'eth_getTransactionByHash'
        }
    },
    'cake_wallet': {
        'name': 'Cake Wallet',
        'api_url': 'https://api.cakewallet.com',
        'required_keys': ['api_key'],
        'endpoints': {
            'balance': '/api/v1/balance',
            'transactions': '/api/v1/transactions'
        }
    }
}

# Configuration des blockchains supportées
BLOCKCHAIN_APIS = {
    'ethereum': {
        'name': 'Ethereum',
        'rpc_url': 'https://mainnet.infura.io/v3/',
        'explorer_api': 'https://api.etherscan.io/api',
        'required_keys': ['infura_project_id', 'etherscan_api_key']
    },
    'bitcoin': {
        'name': 'Bitcoin',
        'rpc_url': 'https://blockstream.info/api',
        'explorer_api': 'https://blockstream.info/api',
        'required_keys': []
    },
    'binance_smart_chain': {
        'name': 'Binance Smart Chain',
        'rpc_url': 'https://bsc-dataseed.binance.org/',
        'explorer_api': 'https://api.bscscan.com/api',
        'required_keys': ['bscscan_api_key']
    }
}
