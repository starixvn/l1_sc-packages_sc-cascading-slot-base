import { EventConsumers } from "sc-slot-game-base";

export default class PromotionFreeSpinsConsumer extends EventConsumers.PromotionFreeSpinsConsumer {
    async processRedeem(player, payload) {
        const result = await this.promotionApiClient.redeemGiftCode({
            giftCode: payload.giftCode,
            operatorId: player.session.operatorId,
            siteName: player.session.siteName,
            playerId: player.session.playerId,
            currencyGroup: player.session.currencyGroupId,
            gameId: this.gameData.gameConfigs.gameId,
        });

        if (result.success) {
            await this.updatePromotion(player, result);
            const promotion = result.promotion;
            const now = new Date();
            this.promotionFreeSpinsPublisher.publishToUser(player.UID, {
                redeemResult: 1,
                promotion: {
                    promotionId: promotion.promotionId,
                    remainingBonusItems: promotion.remainingBonusItems,
                    initialBonusItem: promotion.initialBonusItem,
                    isActive: promotion.endDate ? now < new Date(promotion.endDate) : true,
                    promotionType: promotion.promotionType,
                    endDate: promotion.endDate,
                    lastUsedDate: promotion.lastUsedDate,
                    isGiftCode: promotion.isGiftCode,
                    betLevel: promotion.betLevel,
                    coinValue: promotion.coinValue,
                    totalWin: 0,
                    isClaimed: true,
                },
            });
        } else {
            this.publishRedemptionError(player, result.code, result.message);
        }
    }

    async updatePromotion(player, result) {
        const promotionFreeSpin = await this.promotionApiClient.getPromotionById(result.promotion.promotionId);
        const now = new Date();
        if (promotionFreeSpin.gameIds.includes(this.gameData.gameConfigs.gameId)) {
            const promotion = result.promotion;
            player.promotion = {
                promotionId: promotion.promotionId,
                code: promotion.promotionCode,
                remainingBonusItems: promotion.remainingBonusItems,
                initialBonusItem: promotion.initialBonusItem,
                isActive: promotion.endDate ? now < new Date(promotion.endDate) : true,
                endDate: promotion.endDate,
                lastUsedDate: promotion.lastUsedDate,
                isGiftCode: promotion.isGiftCode,
                betLevel: promotion.betLevel,
                coinValue: promotion.coinValue,
                totalWin: 0,
                isClaimed: true,
            };
        }
    }
}
