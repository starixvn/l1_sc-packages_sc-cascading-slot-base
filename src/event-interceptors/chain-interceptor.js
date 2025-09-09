import { EventInterceptors } from "sc-game-base/src/core";

export default class ChainInterceptor extends EventInterceptors.BaseEventInterceptor {
    constructor({ logService, definition, resultChainManager }) {
        super({ logService, definition });
        this.chainManager = resultChainManager;
    }

    async afterSuccessEvent(context) {
        try {
            const { player } = context;
            const playerName = player.profile.name;

            if (this.chainManager.shouldAssignChain(playerName)) {
                const playerContext = {
                    playerId: player.session?.playerId || player.UID,
                    sessionId: player.session?.sessionId,
                    operatorId: player.session?.operatorId,
                    gameId: player.session?.gameId || "unknown",
                    currency: player.session?.currencyName || "USD",
                };

                const success = await this.chainManager.assignChain(playerName, playerContext);

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
