import { EventInterceptors } from "sc-slot-game-base";

export default class ChainInterceptor extends EventInterceptors.BaseBetInterceptor {
    constructor({ resultChainManager, logService }) {
        super();
        this.chainManager = resultChainManager;
        this.logService = logService;
    }

    async afterSuccessEvent(context) {
        try {
            const { player } = context;
            const playerName = player.profile.name;

            if (this.chainManager.shouldAssignChain(playerName)) {
                const success = this.chainManager.assignChain(playerName);

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
