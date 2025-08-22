import { EventConsumers } from "sc-slot-game-base";

export default class InGameConsumer extends EventConsumers.InGameConsumer {
    constructor({
        definition,
        gameData,
        roundQuery,
        publisher,
        freeSpinsConsumer,
        getBalance,
        jackpotsRepository,
        jackpotValidator,
        gameManagementApiClientFactory,
        userTrackingClient,
        gamePromotionApiClient,
    }) {
        super({
            definition,
            gameData,
            roundQuery,
            publisher,
            getBalance,
            gameManagementApiClientFactory,
            freeSpinsConsumer,
            jackpotsRepository,
            jackpotValidator,
            userTrackingClient,
        });

        this.promotionApiClient = gamePromotionApiClient.instance();
    }

    async buildPayload(realPlayer) {
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === realPlayer.session.currencyGroupId);
        const coinValues = settings?.coinValues;
        const maxWinPerRound = settings?.maxWinPerRound;
        const defaultCoinValue = settings?.defaultCoinValue;

        const { betLevels, betMultiplier, oddsByCounts, freeSpins: freeSpinsConfig } = this.gameData.gameConfigs.cascadingSlotsConfig;
        const gameConfigs = {
            coinValues,
            maxWinPerRound,
            betLevels,
            betMultiplier,
            odds: { symbols: oddsByCounts, freeSpins: freeSpinsConfig },
            defaultCoinValue,
        };

        const freeSpins = this.getAvailableFreeSpins(realPlayer);

        const user = await this.getUserInfo(realPlayer);
        const { exchangeRates } = this.gameData;
        const { session } = realPlayer;
        const rate = exchangeRates.code[session.currencyCode] * session.multiplier;

        const payload = {
            gameConfigs,
            freeSpins,
            totalMultiplier: this.gameData.ingame[realPlayer.profile.name]?.totalMultiplier ?? 0,
            user: {
                ...user,
                rate,
                multiplier: session.multiplier,
            },
        };

        if (realPlayer.promotion && !realPlayer.promotionTOProgress) {
            payload.promotion = realPlayer.promotion;
        }

        if (realPlayer.promotionTOProgress) {
            await this.updatePromotionTOProgress(realPlayer);

            payload.promotionTOProgress = {
                totalTO: realPlayer.promotionTOProgress.totalTurnover,
                minTO: realPlayer.promotionTOProgress.minRequiredTurnover,
                remainTO: realPlayer.promotionTOProgress.remainingTO,
                progress: realPlayer.promotionTOProgress.progressPercentage,
                canClaim: realPlayer.promotionTOProgress.canClaim,
                win: realPlayer.promotionTOProgress.totalWinAmount,
                expire: realPlayer.promotionTOProgress.claimExpirationDate,
                promotionId: realPlayer.promotion.promotionId,
            };
        }

        return payload;
    }

    async updatePromotionTOProgress(realPlayer) {
        const { session, promotion } = realPlayer;
        const promotionTOProgress = await this.promotionApiClient.getTOProgress({
            promotionId: promotion.promotionId,
            playerId: session.playerId,
            operatorId: session.operatorId,
            siteName: session.siteName,
        });

        realPlayer.promotionTOProgress = {
            totalTurnover: promotionTOProgress.totalTurnover,
            minRequiredTurnover: promotionTOProgress.minRequiredTurnover,
            remainingTO: promotionTOProgress.remainingTO,
            progressPercentage: promotionTOProgress.progressPercentage,
            canClaim: promotionTOProgress.canClaim,
            totalWinAmount: promotionTOProgress.totalWinAmount,
            claimExpirationDate: promotionTOProgress.claimExpirationDate,
        };
    }

    getAvailableFreeSpins(realPlayer) {
        const totalOfFreeSpins = this.freeSpinsConsumer.getTotalAvaiableFreeSpins(realPlayer);
        const soonestExpiredFreeSpin = this.freeSpinsConsumer.getSoonestExpiredFreeSpinSet(realPlayer);

        return {
            total: totalOfFreeSpins,
            betLevel: soonestExpiredFreeSpin?.betLevel,
            coinValue: soonestExpiredFreeSpin?.coinValue,
            betMultiplier: soonestExpiredFreeSpin?.betMultiplier,
            promotionId: soonestExpiredFreeSpin?.promotionId,
        };
    }
}
