import { Core } from "sc-game-base";

export default class UserSignInConsumer extends Core.BaseEventConsumers.UserSignInConsumer {
    createClaimedPromotionData(promotion, totalWin, promotionTOProgress = null) {
        const data = super.createClaimedPromotionData(promotion, totalWin, promotionTOProgress);
        data.promotion.betLevel = 1;
        data.promotion.coinValue = promotion.coinValue;

        return data;
    }

    createAvailablePromotionData(promotion) {
        const data = super.createAvailablePromotionData(promotion);
        data.promotion.betLevel = 1;
        data.promotion.coinValue = promotion.coinValue;

        return data;
    }
}
