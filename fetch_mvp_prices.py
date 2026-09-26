"""Commande historique de mise à jour des prix du simulateur.

La récupération officielle des VL ajustées Amundi est désormais dans
fetch_amundi_prices.py. Garder ce point d'entrée pour les usages existants.
"""

from fetch_amundi_prices import main


if __name__ == "__main__":
    main()
