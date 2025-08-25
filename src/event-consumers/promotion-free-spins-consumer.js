import { EventConsumers } from "sc-slot-game-base";

export default class PromotionFreeSpinsConsumer extends EventConsumers.PromotionFreeSpinsConsumer {
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
}
