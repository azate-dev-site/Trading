
import asyncio
import hashlib
import hmac
import time
import json
from typing import Dict, List, Optional, Any
import aiohttp
import os
from datetime import datetime
from wallet_config import WALLET_APIS, BLOCKCHAIN_APIS

class WalletManager:
    def __init__(self):
        self.connected_wallets = {}
        self.user_wallets = {}  # {user_id: [wallet_configs]}
        
    def get_api_credentials(self, wallet_type: str, user_id: str) -> Dict:
        """Récupère les credentials API pour un wallet spécifique"""
        # Les clés API sont stockées de manière sécurisée par utilisateur
        key_prefix = f"{wallet_type.upper()}_{user_id}"
        
        credentials = {}
        required_keys = WALLET_APIS[wallet_type]['required_keys']
        
        for key in required_keys:
            env_key = f"{key_prefix}_{key.upper()}"
            credentials[key] = os.getenv(env_key)
            
        return credentials

    async def connect_binance_wallet(self, user_id: str, api_key: str, secret_key: str, testnet: bool = False) -> Dict:
        """Connecte un wallet Binance"""
        try:
            base_url = WALLET_APIS['binance']['testnet_url'] if testnet else WALLET_APIS['binance']['api_url']
            
            # Générer signature pour l'authentification
            timestamp = int(time.time() * 1000)
            query_string = f"timestamp={timestamp}"
            signature = hmac.new(
                secret_key.encode('utf-8'),
                query_string.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()
            
            headers = {
                'X-MBX-APIKEY': api_key,
                'Content-Type': 'application/json'
            }
            
            async with aiohttp.ClientSession() as session:
                url = f"{base_url}/api/v3/account?{query_string}&signature={signature}"
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        account_data = await response.json()
                        
                        wallet_info = {
                            'type': 'binance',
                            'status': 'connected',
                            'balances': account_data.get('balances', []),
                            'last_update': datetime.now().isoformat(),
                            'permissions': account_data.get('permissions', [])
                        }
                        
                        if user_id not in self.user_wallets:
                            self.user_wallets[user_id] = []
                        self.user_wallets[user_id].append(wallet_info)
                        
                        return {
                            'success': True,
                            'message': 'Wallet Binance connecté avec succès',
                            'wallet_info': wallet_info
                        }
                    else:
                        error_data = await response.json()
                        return {
                            'success': False,
                            'message': f"Erreur Binance: {error_data.get('msg', 'Erreur inconnue')}"
                        }
        except Exception as e:
            return {
                'success': False,
                'message': f"Erreur de connexion Binance: {str(e)}"
            }

    async def connect_metamask_wallet(self, user_id: str, wallet_address: str, infura_project_id: str) -> Dict:
        """Connecte un wallet MetaMask via Web3"""
        try:
            # Vérifier le solde ETH
            async with aiohttp.ClientSession() as session:
                url = f"https://mainnet.infura.io/v3/{infura_project_id}"
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_getBalance",
                    "params": [wallet_address, "latest"],
                    "id": 1
                }
                
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        balance_wei = int(data['result'], 16)
                        balance_eth = balance_wei / 10**18
                        
                        wallet_info = {
                            'type': 'metamask',
                            'status': 'connected',
                            'address': wallet_address,
                            'balance_eth': balance_eth,
                            'balance_wei': balance_wei,
                            'last_update': datetime.now().isoformat()
                        }
                        
                        if user_id not in self.user_wallets:
                            self.user_wallets[user_id] = []
                        self.user_wallets[user_id].append(wallet_info)
                        
                        return {
                            'success': True,
                            'message': 'Wallet MetaMask connecté avec succès',
                            'wallet_info': wallet_info
                        }
                    else:
                        return {
                            'success': False,
                            'message': 'Erreur lors de la connexion à Infura'
                        }
        except Exception as e:
            return {
                'success': False,
                'message': f"Erreur de connexion MetaMask: {str(e)}"
            }

    async def get_wallet_transactions(self, user_id: str, wallet_type: str, limit: int = 50) -> List[Dict]:
        """Récupère les transactions d'un wallet"""
        transactions = []
        
        user_wallets = self.user_wallets.get(user_id, [])
        wallet = next((w for w in user_wallets if w['type'] == wallet_type), None)
        
        if not wallet:
            return []
            
        try:
            if wallet_type == 'binance':
                transactions = await self._get_binance_transactions(user_id, limit)
            elif wallet_type == 'metamask':
                transactions = await self._get_ethereum_transactions(wallet['address'], limit)
                
        except Exception as e:
            print(f"Erreur récupération transactions {wallet_type}: {e}")
            
        return transactions

    async def _get_binance_transactions(self, user_id: str, limit: int) -> List[Dict]:
        """Récupère les transactions Binance"""
        credentials = self.get_api_credentials('binance', user_id)
        if not credentials.get('api_key') or not credentials.get('secret_key'):
            return []
            
        # Implementation des requêtes API Binance pour les transactions
        # Similaire à connect_binance_wallet mais pour l'endpoint trades
        return []

    async def _get_ethereum_transactions(self, address: str, limit: int) -> List[Dict]:
        """Récupère les transactions Ethereum"""
        etherscan_api_key = os.getenv('ETHERSCAN_API_KEY')
        if not etherscan_api_key:
            return []
            
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.etherscan.io/api?module=account&action=txlist&address={address}&startblock=0&endblock=99999999&page=1&offset={limit}&sort=desc&apikey={etherscan_api_key}"
                
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('result', [])
        except Exception as e:
            print(f"Erreur récupération transactions Ethereum: {e}")
            
        return []

    def get_user_wallets(self, user_id: str) -> List[Dict]:
        """Récupère tous les wallets d'un utilisateur"""
        return self.user_wallets.get(user_id, [])

    def disconnect_wallet(self, user_id: str, wallet_type: str) -> bool:
        """Déconnecte un wallet"""
        if user_id in self.user_wallets:
            self.user_wallets[user_id] = [
                w for w in self.user_wallets[user_id] 
                if w['type'] != wallet_type
            ]
            return True
        return False

    async def update_wallet_balances(self, user_id: str) -> Dict:
        """Met à jour les soldes de tous les wallets d'un utilisateur"""
        updated_wallets = []
        user_wallets = self.user_wallets.get(user_id, [])
        
        for wallet in user_wallets:
            try:
                if wallet['type'] == 'binance':
                    # Remettre à jour le solde Binance
                    pass
                elif wallet['type'] == 'metamask':
                    # Remettre à jour le solde ETH
                    pass
                    
                updated_wallets.append(wallet)
            except Exception as e:
                print(f"Erreur mise à jour wallet {wallet['type']}: {e}")
                
        return {
            'success': True,
            'updated_wallets': updated_wallets
        }

# Instance globale du gestionnaire de wallets
wallet_manager = WalletManager()
