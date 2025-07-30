import { helpers } from "sc-common";
import { EventConsumers } from "sc-slot-game-base";

export default class PlaceBetConsumer extends EventConsumers.PlaceBetConsumer {
    handlePromotionLogic(player, payload) {
        const currentDateTime = new Date();
        const freeSpinsOfPlayer = this.gameData.ingame[player.profile.name]?.freeSpins ?? [];
        const soonestExpiredFreeSpinSet = freeSpinsOfPlayer.find(
            (freeSpin) => freeSpin.available > 0 && new Date(freeSpin.expiryTime) > currentDateTime
        );
        const freeSpinExtra = soonestExpiredFreeSpinSet && soonestExpiredFreeSpinSet.promotionId ? true : false;

        if (player.promotion) {
            this.updatePlayerPromotionFreeSpins(player, soonestExpiredFreeSpinSet);
        }

        if (payload.freeSpin && (freeSpinExtra || !soonestExpiredFreeSpinSet)) {
            const usePromotion = player.promotion && player.promotion.isClaimed;
            player.usePromotion = usePromotion;

            if (usePromotion) {
                const { cascadingSlotsConfig } = this.gameData.gameConfigs;
                Object.assign(payload, {
                    betLevel: cascadingSlotsConfig.betLevels[0],
                    coinValue: player.promotion.betLevel,
                    promotionId: player.promotion.promotionId,
                    usePromotion: true,
                });
            }
        } else {
            player.usePromotion = false;
        }
    }

    consume(player, payload) {
        Object.assign(payload, {
            roundId: payload.roundId ?? this.gameData.roundId,
            betLevel: payload.betLevel,
            coinValue: payload.coinValue,
            freeSpin: payload.freeSpin ?? false,
        });

        this.handlePromotionLogic(player, payload);

        const name = player.profile.name;
        if (!this.validateBetRequest(player, payload)) {
            return;
        }

        if (!this.gameData.ingame[name]) {
            const newPlayer = {
                name: player.profile.name,
                currency: player.session.currencyName,
                betTracks: {},
                betQueue: [],
                operatorId: player.session.operatorId,
            };

            this.gameData.ingame[name] = newPlayer;
        }

        this.gameData.ingame[name].betQueue.push({ player, payload });
    }

    validateBetRequest(player, payload) {
        const criteria = this.composeValidationCriteria(player, payload);
        const failedCriterion = criteria.find((criterion) => criterion.failure);

        if (failedCriterion) {
            this.publisher.publishToUser(player.UID, { endBet: -1, notice: failedCriterion.notice });

            return false;
        }

        return true;
    }

    composeValidationCriteria(player, payload) {
        const bettingTimeValidationCriteria = this.composeBettingTimeValidationCriteria();
        const betAmountValidationCriteria = this.composeBetAmountValidationCriteria(player, payload);
        const promotionValidationCriteria = this.composePromotionValidationCriteria(player);

        return bettingTimeValidationCriteria.concat(betAmountValidationCriteria, promotionValidationCriteria);
    }

    composeBettingTimeValidationCriteria() {
        const configs = this.gameData.gameConfigs;

        return [
            {
                failure: !configs.enabled,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    composeBetAmountValidationCriteria(player, payload) {
        const { betLevel, coinValue } = payload;
        const settings = this.gameData.currencyGroupGames.find((x) => x.groupId.toString() === player.session.currencyGroupId) ?? { coinValues: [] };

        return [
            {
                failure: !payload.freeSpin && this.gameData.gameConfigs.cascadingSlotsConfig.betLevels.indexOf(betLevel) === -1,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
            {
                failure: !payload.freeSpin && settings.coinValues.indexOf(coinValue) === -1,
                notice: this.getNoticeObj(helpers.noticeHelper.invalidBet),
            },
        ];
    }

    adjustBetTracks() {}
}
