import { EventInterceptors } from "sc-game-base/src/core";

export default class ChainInterceptor extends EventInterceptors.BaseEventInterceptor {
    constructor({ logService, definition, gameData, resultChainManager, userChainConsumer }) {
        super({ logService, definition });
        this.gameData = gameData;
        this.chainManager = resultChainManager;
        this.userChainConsumer = userChainConsumer;
    }

    async afterSuccessEvent(context) {
        try {
            const { player, bet, balance } = context;
            const playerName = player.profile.name;

            if (this.chainManager.shouldAssignChain(playerName, bet?.betLevel, bet?.coinValue)) {
                const playerContext = {
                    playerId: player.session?.playerId || player.UID,
                    sessionId: player.session?.sessionId,
                    operatorId: player.session?.operatorId,
                    gameId: this.gameData.gameConfigs.gameId,
                    currency: player.session?.currencyName || "",
                    betLevel: bet?.betLevel,
                    coinValue: bet?.coinValue,
                    balance: balance?.red || balance || 0,
                };

                const success = await this.userChainConsumer.assignChain(playerName, playerContext);

                if (!success) {
                    this.logService.logWarning(`No chains available for ${playerName}`);
                }
            }
        } catch (error) {
            this.logService.logError(error);
        }

        return context;
    }

    shouldIntercept(player, bet) {
        return true;
    }
}
