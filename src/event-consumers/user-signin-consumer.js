import { Core } from "sc-game-base";

export default class UserSignInConsumer extends Core.BaseEventConsumers.UserSignInConsumer {
    createClaimedPromotionData(promotion, totalWin, promotionTOProgress = null) {
        const data = super.createClaimedPromotionData(promotion, totalWin, promotionTOProgress);
        data.promotion.betLevel = this.getDefaultBetLevel();
        data.promotion.coinValue = promotion.coinValue;

        return data;
    }

    createAvailablePromotionData(promotion) {
        const data = super.createAvailablePromotionData(promotion);
        data.promotion.betLevel = this.getDefaultBetLevel();
        data.promotion.coinValue = promotion.coinValue;

        return data;
    }

    getDefaultBetLevel() {
        const { cascadingSlotsConfig } = this.gameData.gameConfigs;
        return cascadingSlotsConfig.betLevels[0];
    }
}
