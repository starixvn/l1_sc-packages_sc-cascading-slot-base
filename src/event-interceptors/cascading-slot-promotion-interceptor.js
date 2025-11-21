import { EventInterceptors } from "sc-slot-game-base";

export default class CascadingSlotPromotionInterceptor extends EventInterceptors.SlotPromotionInterceptor {
    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.logService - Logging service
     * @param {Object} dependencies.definition - Game definition
     * @param {Object} dependencies.gameData - Game data
     * @param {Object} dependencies.placeBetPublisher - Publisher for bet events
     * @param {Object} dependencies.gamePromotionApiClient - Promotion API client
     * @param {Object} dependencies.promotionAssignmentConsumer - Promotion assignment consumer
     */
    constructor({ logService, definition, gameData, placeBetPublisher, gamePromotionApiClient, promotionAssignmentConsumer }) {
        super({ logService, definition, placeBetPublisher, gamePromotionApiClient, promotionAssignmentConsumer });
        this.gameData = gameData;
    }

    shouldCompletePromotion(player) {
        return player.promotion.remainingBonusItems === 0 && player.promotion.freeSpinAvailable <= 0;
    }

    async beforeEvent(context) {
        await super.beforeEvent(context);
        this.updatePromotionRemainingBonusItems(context.player);
    }

    async afterFailureEvent(context) {
        await super.afterFailureEvent(context);
        this.updatePromotionRemainingBonusItems(context.player);
    }

    updatePromotionRemainingBonusItems(player) {
        const name = player.profile.name;
        if (this.gameData.ingame[name]?.promotion) {
            this.gameData.ingame[name].promotion.remainingBonusItems = player.promotion.remainingBonusItems;
        }
    }
}
