import { EventConsumers } from "sc-slot-game-base";

export default class PromotionFreeSpinsConsumer extends EventConsumers.PromotionFreeSpinsConsumer {
    constructor({ gamePromotionApiClient, promotionFreeSpinsPublisher, logService, definition, gameData, totalMultiplierConsumer, freeSpinsConsumer }) {
        super({ gamePromotionApiClient, promotionFreeSpinsPublisher, logService, definition, gameData, freeSpinsConsumer });
        this.totalMultiplierConsumer = totalMultiplierConsumer;
    }

    extendPromo(baseData, originalPromotion) {
        return {
            ...baseData,
            betLevel: this.getDefaultBetLevel(),
            coinValue: originalPromotion.coinValue,
        };
    }

    getDefaultBetLevel() {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;

        return cascadingSlotsConfig.betLevels[0];
    }

    async handlePromotionFreeSpinsExpiry() {
        const promotionIds = this.gameData.expiringPromotions.map((promotion) => promotion._id);
        await this.totalMultiplierConsumer.stopExpiredPromotionChain(promotionIds);
        await super.handlePromotionFreeSpinsExpiry();
    }
}
